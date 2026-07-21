import { redis } from "../../lib/redis";
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