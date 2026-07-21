import { Elysia } from "elysia";
import { requireAdmin } from "../../modules/auth/admin.middleware";
import { initUploadBodySchema } from "./video.schema";
import { initUploadSession, FileTooLargeError } from "./upload.service";

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
  );