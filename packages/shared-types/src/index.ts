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

export interface InitUploadResponse {
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
}

export interface ChunkUploadResponse {
  message: string;
  progress: {
    received: number;
    total: number;
    percentage: number;
  };
}

export interface UploadStatusResponse {
  uploadId: string;
  totalChunks: number;
  receivedChunks: number[];
  isComplete: boolean;
}

export interface CompleteUploadResponse {
  message: string;
  video: {
    id: string;
    title: string;
    status: string;
  };
}

export interface Genre {
  id: string;
  name: string;
}

export interface GenreListResponse {
  genres: Genre[];
}

export interface VideoCatalogItem {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  durationSec: number | null;
  viewCount: number;
  genres: string[];
  createdAt: string;
}

export interface VideoCatalogResponse {
  videos: VideoCatalogItem[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface VideoDetail {
  id: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
  viewCount: number;
  status: string;
  genres: string[];
  createdAt: string;
}

export interface PlaybackInitResponse {
  masterPlaylistUrl: string;
}

export interface WatchHistoryItem {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  durationSec: number | null;
  progressSec: number;
  completed: boolean;
  lastWatchedAt: string;
}

export interface WatchHistoryResponse {
  history: WatchHistoryItem[];
}

export interface WatchProgressResponse {
  message: string;
  progressSec: number;
  completed: boolean;
}

export interface UpdateVideoResponse {
  message: string;
  video: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    genres: string[];
  };
}

export interface DeleteVideoResponse {
  message: string;
}

export interface AdminVideoListItem {
  id: string;
  title: string;
  status: string;
  thumbnailUrl: string | null;
  durationSec: number | null;
  viewCount: number;
  createdAt: string;
  latestJob: {
    status: string;
    progress: number;
    errorMessage: string | null;
  } | null;
}

export interface AdminVideoListResponse {
  videos: AdminVideoListItem[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}