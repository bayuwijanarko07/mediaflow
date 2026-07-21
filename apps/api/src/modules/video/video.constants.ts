export const CHUNK_SIZE_BYTES =
  Number(process.env.CHUNK_SIZE_MB ?? 5) * 1024 * 1024;

export const MAX_FILE_SIZE_BYTES =
  Number(process.env.MAX_FILE_SIZE_GB ?? 10) * 1024 * 1024 * 1024;

export const UPLOAD_SESSION_TTL_SECONDS =
  Number(process.env.UPLOAD_SESSION_TTL_HOURS ?? 24) * 60 * 60;

export const UPLOAD_SESSION_REDIS_PREFIX = "upload-session:";

export interface UploadSession {
  uploadId: string;
  fileName: string;
  fileSizeBytes: number;
  totalChunks: number;
  title: string;
  description?: string;
  uploadedById: string;
  receivedChunks: number[];
  createdAt: string;
}