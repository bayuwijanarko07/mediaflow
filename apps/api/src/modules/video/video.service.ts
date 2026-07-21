import { prisma } from "@mediaflow/database";
import { transcodeQueue } from "../../lib/queue";

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