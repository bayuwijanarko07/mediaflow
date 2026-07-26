import { t } from "elysia";

export const initUploadBodySchema = t.Object({
  fileName: t.String({ minLength: 1, error: "Nama file wajib diisi" }),
  fileSizeBytes: t.Number({ minimum: 1, error: "Ukuran file tidak valid" }),
  title: t.String({ minLength: 1, error: "Judul video wajib diisi" }),
  description: t.Optional(t.String()),
  genreIds: t.Optional(t.Array(t.String())),
});

export const chunkParamsSchema = t.Object({
  uploadId: t.String(),
  chunkIndex: t.Numeric(), // otomatis convert string dari URL param jadi number
});

export const uploadStatusParamsSchema = t.Object({
  uploadId: t.String(),
});

export const completeUploadParamsSchema = t.Object({
  uploadId: t.String(),
});

export const videoIdParamsSchema = t.Object({
  id: t.String(),
});

export const catalogQuerySchema = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, default: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50, default: 20 })),
  genre: t.Optional(t.String()),
  search: t.Optional(t.String()),
});

export const trendingQuerySchema = t.Object({
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50, default: 10 })),
})

export const playbackFileParamsSchema = t.Object({
  id: t.String(),
  rendition: t.String(),
  filename: t.String(),
});

export type InitUploadBody = typeof initUploadBodySchema.static;

export const watchProgressBodySchema = t.Object({
  progressSec: t.Number({ minimum: 0, error: "progressSec harus angka >= 0" }),
});

export type WatchProgressBody = typeof watchProgressBodySchema.static;

export const updateVideoBodySchema = t.Object({
  title: t.Optional(t.String({ minLength: 1, error: "Judul tidak boleh kosong" })),
  description: t.Optional(t.String()),
  genreIds: t.Optional(t.Array(t.String())),
});

export type UpdateVideoBody = typeof updateVideoBodySchema.static;

export const adminVideoListQuerySchema = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, default: 1 })),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50, default: 20 })),
  status: t.Optional(
    t.Union(
      [
        t.Literal("UPLOADING"),
        t.Literal("UPLOADED"),
        t.Literal("QUEUED"),
        t.Literal("PROCESSING"),
        t.Literal("READY"),
        t.Literal("FAILED"),
      ],
      { error: "Status tidak valid" }
    )
  ),
});
