import { prisma } from "@mediaflow/database";
import { transcodeQueue } from "../../lib/queue";
import { pathExists } from "@mediaflow/storage";

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