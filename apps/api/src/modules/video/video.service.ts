import { prisma } from "@mediaflow/database";
import { transcodeQueue } from "../../lib/queue";
import { getStoragePath, readFile, pathExists } from "@mediaflow/storage";

export async function createVideoRecord(params: {
  title: string;
  description?: string;
  uploadedById: string;
  rawFileKey: string;
  genreIds?: string[];
}) {
  return prisma.video.create({
    data: {
      title: params.title,
      description: params.description,
      uploadedById: params.uploadedById,
      rawFileKey: params.rawFileKey,
      status: "UPLOADED",
      genres: params.genreIds?.length
        ? { create: params.genreIds.map((genreId) => ({ genreId })) }
        : undefined,
    },
  });
}

export async function queueTranscoding(params: {
  videoId: string;
  rawFilePath: string;
}): Promise<void> {
  await prisma.video.update({
    where: { id: params.videoId },
    data: { status: "QUEUED" },
  });

  await transcodeQueue.add("transcode-video", {
    videoId: params.videoId,
    rawFilePath: params.rawFilePath,
  });
}

export class VideoNotFoundError extends Error {
  constructor() {
    super("Video tidak ditemukan");
    this.name = "VideoNotFoundError";
  }
}

export class VideoNotFailedError extends Error {
  constructor() {
    super("Retry hanya bisa dilakukan untuk video berstatus FAILED");
    this.name = "VideoNotFailedError";
  }
}

export class RawFileNotAvailableError extends Error {
  constructor() {
    super("File mentah video ini sudah tidak tersedia, tidak bisa di-retry");
    this.name = "RawFileNotAvailableError";
  }
}

/**
 * Ambil riwayat lengkap semua percobaan transcoding untuk 1 video,
 * urut dari yang terbaru — dipakai admin untuk debug kenapa video gagal.
 */
export async function getVideoTranscodeJobs(videoId: string) {
  const video = await prisma.video.findUnique({ where: { id: videoId } });

  if (!video) {
    throw new VideoNotFoundError();
  }

  const jobs = await prisma.transcodeJob.findMany({
    where: { videoId },
    orderBy: { createdAt: "desc" },
  });

  return { video, jobs };
}

/**
 * Retry manual — hanya boleh untuk video berstatus FAILED, dan
 * raw file masih harus ada di disk (belum terhapus, sesuai desain
 * Issue #42-43: raw file TIDAK PERNAH dihapus di jalur kegagalan).
 */
export async function retryVideoTranscoding(videoId: string): Promise<void> {
  const video = await prisma.video.findUnique({ where: { id: videoId } });

  if (!video) {
    throw new VideoNotFoundError();
  }

  if (video.status !== "FAILED") {
    throw new VideoNotFailedError();
  }

  if (!video.rawFileKey || !pathExists(video.rawFileKey)) {
    throw new RawFileNotAvailableError();
  }

  await prisma.video.update({
    where: { id: videoId },
    data: { status: "QUEUED" },
  });

  await transcodeQueue.add("transcode-video", {
    videoId: video.id,
    rawFilePath: video.rawFileKey,
  });
}

/**
 * Ambil detail 1 video untuk halaman detail publik. Hanya video
 * berstatus READY yang bisa diakses — video yang masih diproses
 * atau gagal dianggap "tidak ada" dari sudut pandang publik.
 */
export async function getVideoDetail(videoId: string) {
  const video = await prisma.video.findFirst({
    where: { id: videoId, status: "READY" },
    select: {
      id: true,
      title: true,
      description: true,
      thumbnailUrl: true,
      durationSec: true,
      viewCount: true,
      status: true,
      createdAt: true,
      genres: {
        select: { genre: { select: { name: true } } },
      },
    },
  });

  if (!video) {
    throw new VideoNotFoundError();
  }

  return {
    id: video.id,
    title: video.title,
    description: video.description,
    thumbnailUrl: video.thumbnailUrl,
    durationSec: video.durationSec,
    viewCount: video.viewCount,
    status: video.status,
    genres: video.genres.map((g) => g.genre.name),
    createdAt: video.createdAt.toISOString(),
  };
}

/**
 * Ambil video dengan viewCount tertinggi, hanya yang READY.
 */
export async function getTrendingVideos(limit: number) {
  const videos = await prisma.video.findMany({
    where: { status: "READY" },
    orderBy: { viewCount: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      thumbnailUrl: true,
      durationSec: true,
      viewCount: true,
      createdAt: true,
      genres: {
        select: { genre: { select: { name: true } } },
      },
    },
  });

  return videos.map((video) => ({
    id: video.id,
    title: video.title,
    thumbnailUrl: video.thumbnailUrl,
    durationSec: video.durationSec,
    viewCount: video.viewCount,
    genres: video.genres.map((g) => g.genre.name),
    createdAt: video.createdAt.toISOString(),
  }));
}

export class VideoNotReadyError extends Error {
  constructor() {
    super("Video belum siap ditonton");
    this.name = "VideoNotReadyError";
  }
}

export class PlaybackFileNotFoundError extends Error {
  constructor() {
    super("File tidak ditemukan");
    this.name = "PlaybackFileNotFoundError";
  }
}

/**
 * Validasi video ada & statusnya READY, sekaligus increment viewCount.
 * Dipanggil sekali di awal sesi playback (bukan di setiap request segment,
 * supaya viewCount tidak membengkak absurd tiap kali browser minta 1 segment).
 */
export async function initPlaybackSession(videoId: string): Promise<{ masterPlaylistUrl: string }> {
  const video = await prisma.video.findFirst({
    where: { id: videoId, status: "READY" },
  });

  if (!video) {
    throw new VideoNotReadyError();
  }

  await prisma.video.update({
    where: { id: videoId },
    data: { viewCount: { increment: 1 } },
  });

  return {
    masterPlaylistUrl: `/videos/${videoId}/playback/master.m3u8`,
  };
}

/**
 * Serve file master playlist. Validasi video harus READY (sama seperti
 * initPlaybackSession) — supaya endpoint file individual ini juga tidak
 * bisa diakses untuk video yang belum/tidak siap, meski uploadId-nya "ketebak".
 */
export async function getMasterPlaylistFile(videoId: string) {
  const video = await prisma.video.findFirst({
    where: { id: videoId, status: "READY" },
  });

  if (!video) {
    throw new VideoNotReadyError();
  }

  const filePath = getStoragePath("hls", videoId, "master.m3u8");

  if (!pathExists(filePath)) {
    throw new PlaybackFileNotFoundError();
  }

  return readFile(filePath);
}

/**
 * Serve file rendition playlist ATAU segment .ts, tergantung nama file
 * yang diminta. Validasi KETAT terhadap format rendition & filename
 * untuk mencegah path traversal (misal rendition="../../../etc" atau
 * filename="../../secret.txt") — hanya pola yang dikenal yang diizinkan.
 */
export async function getRenditionFile(params: {
  videoId: string;
  rendition: string;
  filename: string;
}) {
  const video = await prisma.video.findFirst({
    where: { id: params.videoId, status: "READY" },
  });

  if (!video) {
    throw new VideoNotReadyError();
  }

  // Validasi ketat: rendition cuma boleh format standar (1080p, 720p, dst)
  if (!/^\d{3,4}p$/.test(params.rendition)) {
    throw new PlaybackFileNotFoundError();
  }

  // Validasi ketat: filename cuma boleh "playlist.m3u8" atau "segment_XXX.ts"
  const isValidPlaylist = params.filename === "playlist.m3u8";
  const isValidSegment = /^segment_\d{3,}\.ts$/.test(params.filename);

  if (!isValidPlaylist && !isValidSegment) {
    throw new PlaybackFileNotFoundError();
  }

  const filePath = getStoragePath("hls", params.videoId, params.rendition, params.filename);

  if (!pathExists(filePath)) {
    throw new PlaybackFileNotFoundError();
  }

  return readFile(filePath);
}

// Threshold: video dianggap "selesai ditonton" kalau progress >= 95% durasi
const WATCH_COMPLETED_THRESHOLD = 0.95;

/**
 * Upsert posisi tontonan user untuk 1 video. Hanya video READY yang
 * boleh disimpan progress-nya (video yang sudah dihapus/belum siap
 * dianggap tidak valid untuk di-track).
 */
export async function upsertWatchProgress(params: {
  userId: string;
  videoId: string;
  progressSec: number;
}) {
  const video = await prisma.video.findFirst({
    where: { id: params.videoId, status: "READY" },
  });

  if (!video) {
    throw new VideoNotFoundError();
  }

  // Kalau durationSec belum diketahui (edge case), jangan tandai completed
  const completed = video.durationSec
    ? params.progressSec >= video.durationSec * WATCH_COMPLETED_THRESHOLD
    : false;

  const watchHistory = await prisma.watchHistory.upsert({
    where: {
      userId_videoId: { userId: params.userId, videoId: params.videoId },
    },
    update: { progressSec: params.progressSec, completed },
    create: {
      userId: params.userId,
      videoId: params.videoId,
      progressSec: params.progressSec,
      completed,
    },
  });

  return watchHistory;
}

/**
 * Ambil riwayat tontonan 1 user, urut dari terakhir ditonton.
 * Video yang statusnya sudah bukan READY lagi (dihapus/gagal) disaring
 * keluar — dari sudut pandang "Lanjutkan Menonton", video itu sudah
 * tidak relevan untuk ditampilkan.
 */
export async function getUserWatchHistory(userId: string) {
  const history = await prisma.watchHistory.findMany({
    where: { userId, video: { status: "READY" } },
    orderBy: { lastWatchedAt: "desc" },
    include: {
      video: {
        select: {
          id: true,
          title: true,
          thumbnailUrl: true,
          durationSec: true,
        },
      },
    },
  });

  return history.map((entry) => ({
    videoId: entry.video.id,
    title: entry.video.title,
    thumbnailUrl: entry.video.thumbnailUrl,
    durationSec: entry.video.durationSec,
    progressSec: entry.progressSec,
    completed: entry.completed,
    lastWatchedAt: entry.lastWatchedAt.toISOString(),
  }));
}