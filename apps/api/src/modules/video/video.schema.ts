import { t } from "elysia";

export const initUploadBodySchema = t.Object({
  fileName: t.String({ minLength: 1, error: "Nama file wajib diisi" }),
  fileSizeBytes: t.Number({ minimum: 1, error: "Ukuran file tidak valid" }),
  title: t.String({ minLength: 1, error: "Judul video wajib diisi" }),
  description: t.Optional(t.String()),
});

export type InitUploadBody = typeof initUploadBodySchema.static;