import { Elysia } from "elysia";
import { requireAdmin } from "../../modules/auth/admin.middleware";
import {
  initUploadBodySchema,
  chunkParamsSchema,
  uploadStatusParamsSchema,
  completeUploadParamsSchema,
  videoIdParamsSchema
} from "./video.schema";
import {
  initUploadSession,
  receiveChunk,
  getUploadStatus,
  assembleChunks,
  deleteUploadSession,
  getUploadSession,
  FileTooLargeError,
  UploadSessionNotFoundError,
  InvalidChunkIndexError,
  IncompleteUploadError,
} from "./upload.service";
import { 
  createVideoRecord,
  queueTranscoding,
  getVideoTranscodeJobs,
  retryVideoTranscoding,
  VideoNotFoundError,
  VideoNotFailedError,
  RawFileNotAvailableError,
} from "./video.service";
import { get } from "https";

export const videoController = new Elysia({ prefix: "/videos" })
    .use(requireAdmin)
    .post(
        "/upload/init",
        async ({ body, adminUser, set }) => {
        try {
            const result = await initUploadSession({
              fileName: body.fileName,
              fileSizeBytes: body.fileSizeBytes,
              title: body.title,
              description: body.description,
              genreIds: body.genreIds,
              uploadedById: adminUser.id,
            });

            set.status = 201;
            return result;
        } catch (error) {
            if (error instanceof FileTooLargeError) {
              set.status = 413; // Payload Too Large
              return { message: error.message };
            }

            set.status = 500;
            return { message: "Terjadi kesalahan pada server" };
        }
        },
        { body: initUploadBodySchema }
    )
    .put(
    "/upload/:uploadId/chunk/:chunkIndex",
    async ({ params, request, set }) => {
        try {
        const chunkData = await request.arrayBuffer();

        const result = await receiveChunk({
            uploadId: params.uploadId,
            chunkIndex: params.chunkIndex,
            chunkData,
        });

        return {
            message: "Chunk diterima",
            progress: {
            received: result.receivedCount,
            total: result.totalChunks,
            percentage: Math.round(
                (result.receivedCount / result.totalChunks) * 100
            ),
            },
        };
        } catch (error) {
        if (error instanceof UploadSessionNotFoundError) {
            set.status = 404;
            return { message: error.message };
        }

        if (error instanceof InvalidChunkIndexError) {
            set.status = 400;
            return { message: error.message };
        }

        set.status = 500;
        return { message: "Terjadi kesalahan pada server" };
        }
    },
    { params: chunkParamsSchema }
    )
    .get(
    "/upload/:uploadId/status",
    async ({ params, set }) => {
      try {
        const status = await getUploadStatus(params.uploadId);
        return status;
      } catch (error) {
        if (error instanceof UploadSessionNotFoundError) {
          set.status = 404;
          return { message: error.message };
        }

        set.status = 500;
        return { message: "Terjadi kesalahan pada server" };
      }
    },
    { params: uploadStatusParamsSchema }
    )
    .post(
    "/upload/:uploadId/complete",
    async ({ params, adminUser, set }) => {
      try {
        const session = await getUploadSession(params.uploadId);

        if (!session) {
          set.status = 404;
          return { message: "Sesi upload tidak ditemukan atau sudah kedaluwarsa" };
        }

        // 1. Gabungkan seluruh chunk jadi 1 file utuh
        const { rawFilePath } = await assembleChunks({
          uploadId: params.uploadId,
          fileName: session.fileName,
        });

        // 2. Buat record Video di database (status UPLOADED)
        const video = await createVideoRecord({
          title: session.title,
          description: session.description,
          uploadedById: adminUser.id,
          rawFileKey: rawFilePath,
          genreIds: session.genreIds,
        });

        // 3. Push job transcoding ke BullMQ (status jadi QUEUED)
        await queueTranscoding({
          videoId: video.id,
          rawFilePath,
        });

        // 4. Bersihkan sesi upload dari Redis, sudah tidak dibutuhkan
        await deleteUploadSession(params.uploadId);

        set.status = 201;
        return {
          message: "Upload selesai, video sedang diproses",
          video: {
            id: video.id,
            title: video.title,
            status: "QUEUED",
          },
        };
      } catch (error) {
        if (error instanceof IncompleteUploadError) {
          set.status = 400;
          return { message: error.message };
        }

        set.status = 500;
        console.error("Error saat complete upload:", error);
        return { message: "Terjadi kesalahan pada server" };
      }
    },
    { params: completeUploadParamsSchema }
    )
    .get(
    "/admin/:id/jobs",
    async ({ params, set }) => {
      try {
        const { video, jobs } = await getVideoTranscodeJobs(params.id);

        return {
          video: {
            id: video.id,
            title: video.title,
            status: video.status,
          },
          jobs: jobs.map((job) => ({
            id: job.id,
            status: job.status,
            progress: job.progress,
            errorMessage: job.errorMessage,
            startedAt: job.startedAt,
            completedAt: job.completedAt,
            createdAt: job.createdAt,
          })),
        };
      } catch (error) {
        if (error instanceof VideoNotFoundError) {
          set.status = 404;
          return { message: error.message };
        }

        set.status = 500;
        return { message: "Terjadi kesalahan pada server" };
      }
    },
    { params: videoIdParamsSchema }
    )
    .post(
    "/admin/:id/retry",
    async ({ params, set }) => {
      try {
        await retryVideoTranscoding(params.id);

        set.status = 200;
        return { message: "Video berhasil di-queue ulang untuk transcoding" };
      } catch (error) {
        if (error instanceof VideoNotFoundError) {
          set.status = 404;
          return { message: error.message };
        }

        if (error instanceof VideoNotFailedError) {
          set.status = 400;
          return { message: error.message };
        }

        if (error instanceof RawFileNotAvailableError) {
          set.status = 409;
          return { message: error.message };
        }

        set.status = 500;
        return { message: "Terjadi kesalahan pada server" };
      }
    },
    { params: videoIdParamsSchema }
    );