import { prisma } from "@mediaflow/database";

export async function markVideoProcessing(videoId: string): Promise<void> {
  await prisma.video.update({
    where: { id: videoId },
    data: { status: "PROCESSING" },
  });
}

export async function markVideoReady(params: {
  videoId: string;
  durationSec: number;
  masterPlaylistUrl: string;
}): Promise<void> {
  await prisma.video.update({
    where: { id: params.videoId },
    data: {
      status: "READY",
      durationSec: params.durationSec,
      masterPlaylistUrl: params.masterPlaylistUrl,
    },
  });
}

export async function markVideoFailed(videoId: string): Promise<void> {
  await prisma.video.update({
    where: { id: videoId },
    data: { status: "FAILED" },
  });
}

export async function createTranscodeJobRecord(videoId: string) {
  return prisma.transcodeJob.create({
    data: {
      videoId,
      status: "RUNNING",
      startedAt: new Date(),
    },
  });
}

export async function updateTranscodeJobProgress(
  jobId: string,
  progress: number
): Promise<void> {
  await prisma.transcodeJob.update({
    where: { id: jobId },
    data: { progress },
  });
}

export async function completeTranscodeJobRecord(jobId: string): Promise<void> {
  await prisma.transcodeJob.update({
    where: { id: jobId },
    data: { status: "COMPLETED", progress: 100, completedAt: new Date() },
  });
}

export async function failTranscodeJobRecord(
  jobId: string,
  errorMessage: string
): Promise<void> {
  await prisma.transcodeJob.update({
    where: { id: jobId },
    data: { status: "FAILED", errorMessage, completedAt: new Date() },
  });
}

export async function createVideoRendition(params: {
  videoId: string;
  resolution: string;
  bitrateKbps: number;
  playlistUrl: string;
}) {
  return prisma.videoRendition.create({
    data: {
      videoId: params.videoId,
      resolution: params.resolution,
      bitrateKbps: params.bitrateKbps,
      playlistUrl: params.playlistUrl,
    },
  });
}