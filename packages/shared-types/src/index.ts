export type UserRole = "USER" | "ADMIN";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  isVerified: boolean;
  role: UserRole;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface RegisterResponse {
  user: AuthUser & { createdAt: string };
}

export interface ApiErrorResponse {
  message: string;
  details?: unknown;
}

/**
 * Nama queue BullMQ untuk transcoding video.
 * Dipakai konsisten oleh apps/api (producer) dan apps/worker (consumer).
 */
export const TRANSCODE_QUEUE_NAME = "transcode-queue";

/**
 * Payload data yang dikirim saat push job transcoding ke queue.
 */
export interface TranscodeJobData {
  videoId: string;
  rawFilePath: string;
}