import { Elysia } from "elysia";
import { requireAdmin } from "../../modules/auth/admin.middleware";
import { requireAuth } from "../../middleware/auth.middleware";
import {
  initUploadBodySchema,
  chunkParamsSchema,
  uploadStatusParamsSchema,
  completeUploadParamsSchema,
  videoIdParamsSchema,
  catalogQuerySchema,
  trendingQuerySchema,
  playbackFileParamsSchema,
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
  getVideoCatalog,
} from "./upload.service";
import { 
  createVideoRecord,
  queueTranscoding,
  getVideoTranscodeJobs,
  retryVideoTranscoding,
  VideoNotFoundError,
  VideoNotFailedError,
  RawFileNotAvailableError,
  getVideoDetail,
  getTrendingVideos,
  initPlaybackSession,
  getMasterPlaylistFile,
  getRenditionFile,
  VideoNotReadyError,
  PlaybackFileNotFoundError,
} from "./video.service";

export const videoController = new Elysia({ prefix: "/videos" })
    // ===== ROUTE PUBLIK (butuh login biasa, bukan admin — proteksi
    // penuh via requireAuth akan ditambahkan di Issue #47 untuk playback,
    // untuk katalog sendiri di v1 ini dibiarkan bisa diakses siapa saja
    // yang sudah login, tanpa perlu requireAdmin) =====
    .get(
      "/",
      async ({ query }) => {
        const result = await getVideoCatalog({
          page: query.page ?? 1,
          limit: query.limit ?? 20,
          genre: query.genre,
          search: query.search,
        });

        return result;
      },
      { query: catalogQuerySchema }
    )
    .get(
      "/trending",
      async ({ query }) => {
        const videos = await getTrendingVideos(query.limit ?? 10);
        return { videos };
      },
      { query: trendingQuerySchema }
    )
    .get(
      "/:id",
      async ({ params, set }) => {
        try {
          const video = await getVideoDetail(params.id);
          return { video };
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
    .use(requireAuth)
    .get(
      "/:id/playback",
      async ({ params, set }) => {
        try {
          const result = await initPlaybackSession(params.id);
          return result;
        } catch (error) {
          if (error instanceof VideoNotReadyError) {
            set.status = 404;
            return { message: error.message };
          }
          set.status = 500;
          return { message: "Terjadi kesalahan pada server" };
        }
      },
      { params: videoIdParamsSchema }
    )
    .get(
      "/:id/playback/master.m3u8",
      async ({ params, set }) => {
        try {
          const file = await getMasterPlaylistFile(params.id);
          return new Response(file, {
            headers: { "Content-Type": "application/vnd.apple.mpegurl" },
          });
        } catch (error) {
          if (error instanceof VideoNotReadyError || error instanceof PlaybackFileNotFoundError) {
            set.status = 404;
            return { message: error.message };
          }
          set.status = 500;
          return { message: "Terjadi kesalahan pada server" };
        }
      },
      { params: videoIdParamsSchema }
    )
    .get(
      "/:id/playback/:rendition/:filename",
      async ({ params, set }) => {
        try {
          const file = await getRenditionFile({
            videoId: params.id,
            rendition: params.rendition,
            filename: params.filename,
          });

          const contentType = params.filename.endsWith(".m3u8")
            ? "application/vnd.apple.mpegurl"
            : "video/mp2t"; // MIME type untuk file .ts

          return new Response(file, {
            headers: { "Content-Type": contentType },
          });
        } catch (error) {
          if (error instanceof VideoNotReadyError || error instanceof PlaybackFileNotFoundError) {
            set.status = 404;
            return { message: error.message };
          }
          set.status = 500;
          return { message: "Terjadi kesalahan pada server" };
        }
      },
      { params: playbackFileParamsSchema }
    )
    // ===== ROUTE ADMIN-ONLY (upload, manage) =====
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