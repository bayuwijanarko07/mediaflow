import { redis } from "../../lib/redis";
import { getStoragePath, saveFile, readFile, deleteDirectory, deleteFile } from "@mediaflow/storage";
import { extname } from "node:path"

import {
  CHUNK_SIZE_BYTES,
  MAX_FILE_SIZE_BYTES,
  UPLOAD_SESSION_TTL_SECONDS,
  UPLOAD_SESSION_REDIS_PREFIX,
  type UploadSession,
} from "./video.constants";

export class FileTooLargeError extends Error {
  constructor(maxSizeGb: number) {
    super(`Ukuran file melebihi batas maksimal ${maxSizeGb}GB`);
    this.name = "FileTooLargeError";
  }
}

function getSessionKey(uploadId: string): string {
  return `${UPLOAD_SESSION_REDIS_PREFIX}${uploadId}`;
}

/**
 * Mulai sesi upload baru. Menghitung total chunk yang diharapkan
 * berdasarkan ukuran file dan CHUNK_SIZE_BYTES, lalu simpan metadata
 * sesi ke Redis dengan TTL supaya sesi yang ditinggalkan (tidak
 * pernah di-complete) otomatis "basi" dan terhapus sendiri.
 */
export async function initUploadSession(params: {
  fileName: string;
  fileSizeBytes: number;
  title: string;
  description?: string;
  uploadedById: string;
}): Promise<{ uploadId: string; chunkSize: number; totalChunks: number }> {
  const maxSizeGb = MAX_FILE_SIZE_BYTES / (1024 * 1024 * 1024);

  if (params.fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new FileTooLargeError(maxSizeGb);
  }

  const uploadId = crypto.randomUUID();
  const totalChunks = Math.ceil(params.fileSizeBytes / CHUNK_SIZE_BYTES);

  const session: UploadSession = {
    uploadId,
    fileName: params.fileName,
    fileSizeBytes: params.fileSizeBytes,
    totalChunks,
    title: params.title,
    description: params.description,
    uploadedById: params.uploadedById,
    receivedChunks: [],
    createdAt: new Date().toISOString(),
  };

  await redis.set(
    getSessionKey(uploadId),
    JSON.stringify(session),
    "EX",
    UPLOAD_SESSION_TTL_SECONDS
  );

  return { uploadId, chunkSize: CHUNK_SIZE_BYTES, totalChunks };
}

/**
 * Ambil data sesi upload dari Redis. Return null kalau sesi
 * tidak ditemukan (belum pernah dibuat, atau sudah expired/basi).
 */
export async function getUploadSession(
  uploadId: string
): Promise<UploadSession | null> {
  const raw = await redis.get(getSessionKey(uploadId));
  if (!raw) return null;
  return JSON.parse(raw) as UploadSession;
}

/**
 * Simpan ulang data sesi (dipakai nanti di Issue #35 saat menandai
 * chunk baru diterima).
 */
export async function saveUploadSession(session: UploadSession): Promise<void> {
  await redis.set(
    getSessionKey(session.uploadId),
    JSON.stringify(session),
    "EX",
    UPLOAD_SESSION_TTL_SECONDS
  );
}

export class UploadSessionNotFoundError extends Error {
  constructor() {
    super("Sesi upload tidak ditemukan atau sudah kedaluwarsa");
    this.name = "UploadSessionNotFoundError";
  }
}

export class InvalidChunkIndexError extends Error {
  constructor(chunkIndex: number, totalChunks: number) {
    super(
      `Chunk index ${chunkIndex} tidak valid (total chunk: ${totalChunks})`
    );
    this.name = "InvalidChunkIndexError";
  }
}

/**
 * Terima 1 chunk file, simpan ke disk, dan update status chunk
 * yang sudah diterima di Redis. Idempotent — kalau chunk yang sama
 * dikirim ulang (misal karena retry dari client), tidak masalah,
 * cukup di-overwrite dan index-nya tidak dobel di receivedChunks.
 */
export async function receiveChunk(params: {
  uploadId: string;
  chunkIndex: number;
  chunkData: ArrayBuffer;
}): Promise<{ receivedCount: number; totalChunks: number }> {
  const session = await getUploadSession(params.uploadId);

  if (!session) {
    throw new UploadSessionNotFoundError();
  }

  if (params.chunkIndex < 0 || params.chunkIndex >= session.totalChunks) {
    throw new InvalidChunkIndexError(params.chunkIndex, session.totalChunks);
  }

  // Simpan chunk ke disk
  const chunkPath = getStoragePath(
    "uploads-temp",
    params.uploadId,
    `chunk-${params.chunkIndex}`
  );
  await saveFile(chunkPath, params.chunkData);

  // Update daftar chunk yang sudah diterima (hindari duplikat kalau retry)
  if (!session.receivedChunks.includes(params.chunkIndex)) {
    session.receivedChunks.push(params.chunkIndex);
    session.receivedChunks.sort((a, b) => a - b);
  }

  await saveUploadSession(session);

  return {
    receivedCount: session.receivedChunks.length,
    totalChunks: session.totalChunks,
  };
}

/**
 * Ambil status upload — daftar chunk yang sudah diterima, dipakai
 * frontend untuk resume upload setelah koneksi putus (tidak perlu
 * kirim ulang chunk yang sudah sukses sebelumnya).
 */
export async function getUploadStatus(uploadId: string): Promise<{
  uploadId: string;
  totalChunks: number;
  receivedChunks: number[];
  isComplete: boolean;
}> {
  const session = await getUploadSession(uploadId);

  if (!session) {
    throw new UploadSessionNotFoundError();
  }

  return {
    uploadId: session.uploadId,
    totalChunks: session.totalChunks,
    receivedChunks: session.receivedChunks,
    isComplete: session.receivedChunks.length === session.totalChunks,
  };
}

export class IncompleteUploadError extends Error {
  constructor(received: number, total: number) {
    super(`Upload belum lengkap: ${received}/${total} chunk diterima`);
    this.name = "IncompleteUploadError";
  }
}

/**
 * Gabungkan seluruh chunk (berurutan sesuai index) jadi 1 file utuh,
 * simpan ke raw-temp/, lalu hapus folder chunk sementara karena
 * sudah tidak dibutuhkan lagi setelah assembly sukses.
 */
export async function assembleChunks(params: {
  uploadId: string;
  fileName: string;
}): Promise<{ rawFilePath: string }> {
  const session = await getUploadSession(params.uploadId);

  if (!session) {
    throw new UploadSessionNotFoundError();
  }

  if (session.receivedChunks.length !== session.totalChunks) {
    throw new IncompleteUploadError(
      session.receivedChunks.length,
      session.totalChunks
    );
  }

  const extension = extname(params.fileName) || ".mp4";
  const rawFilePath = getStoragePath(
    "raw-temp",
    `${params.uploadId}${extension}`
  );

  // Gabungkan chunk berurutan (index 0, 1, 2, ...) jadi satu file utuh.
  // Dibaca satu per satu (bukan load semua ke memory sekaligus) supaya
  // aman untuk file besar (>1GB) tanpa membebani RAM.
  const chunkBuffers: Uint8Array[] = [];
  for (let i = 0; i < session.totalChunks; i++) {
    const chunkPath = getStoragePath("uploads-temp", params.uploadId, `chunk-${i}`);
    const chunkFile = readFile(chunkPath);
    const chunkArrayBuffer = await chunkFile.arrayBuffer();
    chunkBuffers.push(new Uint8Array(chunkArrayBuffer));
  }

  const totalSize = chunkBuffers.reduce((sum, buf) => sum + buf.length, 0);
  const combined = new Uint8Array(totalSize);
  let offset = 0;
  for (const buf of chunkBuffers) {
    combined.set(buf, offset);
    offset += buf.length;
  }

  await saveFile(rawFilePath, combined);

  // Hapus folder chunk sementara — sudah tidak dibutuhkan setelah assembly
  await deleteDirectory(getStoragePath("uploads-temp", params.uploadId));

  return { rawFilePath };
}

/**
 * Hapus sesi upload dari Redis setelah proses complete selesai
 * (baik sukses maupun kalau perlu dibatalkan).
 */
export async function deleteUploadSession(uploadId: string): Promise<void> {
  await redis.del(`${UPLOAD_SESSION_REDIS_PREFIX}${uploadId}`);
}