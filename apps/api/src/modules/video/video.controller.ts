import { Elysia } from "elysia";
import { requireAdmin } from "../../modules/auth/admin.middleware";
import { initUploadBodySchema, chunkParamsSchema  } from "./video.schema";
import {
  initUploadSession,
  receiveChunk,
  FileTooLargeError,
  UploadSessionNotFoundError,
  InvalidChunkIndexError,
} from "./upload.service";

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
    );