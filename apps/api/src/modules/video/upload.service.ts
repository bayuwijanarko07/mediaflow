import { redis } from "../../lib/redis";
import { getStoragePath, saveFile, readFile, deleteDirectory } from "@mediaflow/storage";
import { extname } from "node:path";
import { prisma, Prisma } from "@mediaflow/database";
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

export class UploadSessionNotFoundError extends Error {
  constructor() {
    super("Sesi upload tidak ditemukan atau sudah kedaluwarsa");
    this.name = "UploadSessionNotFoundError";
  }
}

export class InvalidChunkIndexError extends Error {
  constructor(chunkIndex: number, totalChunks: number) {
    super(`Chunk index ${chunkIndex} tidak valid (total chunk: ${totalChunks})`);
    this.name = "InvalidChunkIndexError";
  }
}

export class IncompleteUploadError extends Error {
  constructor(received: number, total: number) {
    super(`Upload belum lengkap: ${received}/${total} chunk diterima`);
    this.name = "IncompleteUploadError";
  }
}

function getSessionKey(uploadId: string): string {
  return `${UPLOAD_SESSION_REDIS_PREFIX}${uploadId}`;
}

/**
 * Key terpisah untuk Redis SET yang menyimpan index chunk yang sudah
 * diterima. Dipisah dari JSON metadata sesi supaya update-nya bisa
 * pakai SADD yang ATOMIC — mencegah race condition saat banyak chunk
 * di-upload paralel bersamaan (lihat penjelasan lengkap di komentar
 * fungsi receiveChunk di bawah).
 */
function getReceivedChunksKey(uploadId: string): string {
  return `${UPLOAD_SESSION_REDIS_PREFIX}${uploadId}:received-chunks`;
}

/**
 * Mulai sesi upload baru. Metadata (fileName, totalChunks, dst) disimpan
 * sebagai JSON biasa karena TIDAK pernah di-update konkuren dari banyak
 * request sekaligus — hanya dibaca. Tracking chunk yang diterima
 * disimpan TERPISAH di Redis Set (lihat markChunkReceived).
 */
export async function initUploadSession(params: {
  fileName: string;
  fileSizeBytes: number;
  title: string;
  description?: string;
  genreIds?: string[];
  uploadedById: string;
}): Promise<{ uploadId: string; chunkSize: number; totalChunks: number }> {
  const maxSizeGb = MAX_FILE_SIZE_BYTES / (1024 * 1024 * 1024);

  if (params.fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new FileTooLargeError(maxSizeGb);
  }

  const uploadId = crypto.randomUUID();
  const totalChunks = Math.ceil(params.fileSizeBytes / CHUNK_SIZE_BYTES);

  const session: Omit<UploadSession, "receivedChunks"> = {
    uploadId,
    fileName: params.fileName,
    fileSizeBytes: params.fileSizeBytes,
    totalChunks,
    title: params.title,
    description: params.description,
    genreIds: params.genreIds,
    uploadedById: params.uploadedById,
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
 * Ambil metadata sesi (TANPA receivedChunks — itu diambil terpisah
 * lewat getReceivedChunks kalau dibutuhkan).
 */
export async function getUploadSession(
  uploadId: string
): Promise<Omit<UploadSession, "receivedChunks"> | null> {
  const raw = await redis.get(getSessionKey(uploadId));
  if (!raw) return null;
  return JSON.parse(raw);
}

/**
 * Tandai 1 chunk index sudah diterima. Pakai SADD (atomic) — aman
 * dipanggil dari banyak request paralel bersamaan tanpa race condition,
 * karena Redis menjamin setiap command SADD dieksekusi secara utuh
 * (single-threaded execution model), tidak seperti pola read-modify-write
 * manual yang rawan lost update.
 */
export async function markChunkReceived(
  uploadId: string,
  chunkIndex: number
): Promise<void> {
  const key = getReceivedChunksKey(uploadId);
  await redis.sadd(key, String(chunkIndex));
  // Refresh TTL supaya konsisten dengan masa berlaku sesi utama
  await redis.expire(key, UPLOAD_SESSION_TTL_SECONDS);
}

/**
 * Ambil daftar index chunk yang sudah diterima, terurut ascending.
 */
export async function getReceivedChunks(uploadId: string): Promise<number[]> {
  const key = getReceivedChunksKey(uploadId);
  const members = await redis.smembers(key);
  return members.map(Number).sort((a, b) => a - b);
}

/**
 * Hitung jumlah chunk yang sudah diterima. Pakai SCARD (juga atomic
 * dan O(1)) — lebih efisien daripada SMEMBERS kalau cuma butuh angkanya.
 */
export async function getReceivedChunkCount(uploadId: string): Promise<number> {
  const key = getReceivedChunksKey(uploadId);
  return redis.scard(key);
}

/**
 * Terima 1 chunk file, simpan ke disk, dan tandai index-nya diterima
 * lewat Redis Set (atomic, aman untuk upload paralel).
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

  const chunkPath = getStoragePath(
    "uploads-temp",
    params.uploadId,
    `chunk-${params.chunkIndex}`
  );
  await saveFile(chunkPath, params.chunkData);

  // Atomic — aman dipanggil paralel, tidak akan kehilangan update
  await markChunkReceived(params.uploadId, params.chunkIndex);

  const receivedCount = await getReceivedChunkCount(params.uploadId);

  return { receivedCount, totalChunks: session.totalChunks };
}

/**
 * Ambil status upload lengkap — gabungan metadata + daftar chunk diterima.
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

  const receivedChunks = await getReceivedChunks(uploadId);

  return {
    uploadId: session.uploadId,
    totalChunks: session.totalChunks,
    receivedChunks,
    isComplete: receivedChunks.length === session.totalChunks,
  };
}

/**
 * Gabungkan seluruh chunk jadi 1 file utuh. Sekarang mengecek
 * kelengkapan lewat getReceivedChunkCount (Set), bukan panjang array
 * di JSON — konsisten dengan sumber kebenaran yang baru.
 */
export async function assembleChunks(params: {
  uploadId: string;
  fileName: string;
}): Promise<{ rawFilePath: string }> {
  const session = await getUploadSession(params.uploadId);

  if (!session) {
    throw new UploadSessionNotFoundError();
  }

  const receivedCount = await getReceivedChunkCount(params.uploadId);

  if (receivedCount !== session.totalChunks) {
    throw new IncompleteUploadError(receivedCount, session.totalChunks);
  }

  const extension = extname(params.fileName) || ".mp4";
  const rawFilePath = getStoragePath("raw-temp", `${params.uploadId}${extension}`);

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
  await deleteDirectory(getStoragePath("uploads-temp", params.uploadId));

  return { rawFilePath };
}

/**
 * Hapus sesi upload (metadata + set chunk diterima) dari Redis.
 */
export async function deleteUploadSession(uploadId: string): Promise<void> {
  await redis.del(getSessionKey(uploadId));
  await redis.del(getReceivedChunksKey(uploadId));
}

export async function getVideoCatalog(params: {
  page: number;
  limit: number;
  genre?: string;
  search?: string;
}) {
  const skip = (params.page - 1) * params.limit;

  // Bangun kondisi where secara dinamis — hanya tambahkan filter
  // yang benar-benar diberikan, supaya query tetap efisien
  const where: Prisma.VideoWhereInput = {
    status: "READY", // WAJIB: cuma video siap tonton yang muncul di katalog publik
  };

  if (params.search) {
    where.title = {
      contains: params.search,
      mode: "insensitive", // pencarian case-insensitive
    };
  }

  if (params.genre) {
    where.genres = {
      some: {
        genre: { name: { equals: params.genre, mode: "insensitive" } },
      },
    };
  }

  const [videos, totalItems] = await Promise.all([
    prisma.video.findMany({
      where,
      skip,
      take: params.limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        thumbnailUrl: true,
        durationSec: true,
        viewCount: true,
        createdAt: true,
        genres: {
          select: {
            genre: { select: { name: true } },
          },
        },
      },
    }),
    prisma.video.count({ where }),
  ]);

  return {
    videos: videos.map((video) => ({
      id: video.id,
      title: video.title,
      thumbnailUrl: video.thumbnailUrl,
      durationSec: video.durationSec,
      viewCount: video.viewCount,
      genres: video.genres.map((g) => g.genre.name),
      createdAt: video.createdAt.toISOString(),
    })),
    pagination: {
      page: params.page,
      limit: params.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / params.limit),
    },
  };
}