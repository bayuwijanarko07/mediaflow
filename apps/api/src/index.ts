import { Elysia } from "elysia";
import { corsPlugin } from "./plugins/cors.plugin";
import { healthController } from "./modules/health/health.controller";
import { authController } from "./modules/auth/auth.controller";
import { videoController } from "./modules/video/video.controller";
import { genreController } from "./modules/genre/genre.controller";
import { ensureStorageDirs } from "@mediaflow/storage";

const PORT = process.env.PORT ?? 4000;

await ensureStorageDirs();
console.log("✅ Folder storage siap");

const app = new Elysia()
  .use(corsPlugin)
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 422;
      return { message: "Validasi gagal", details: error.message };
    }

    if (code === "NOT_FOUND") {
      set.status = 404;
      return { message: "Endpoint tidak ditemukan" };
    }

    // Untuk error yang dilempar manual (throw new Error(...)) dari
    // middleware/controller, set.status SUDAH di-set sebelum throw,
    // jadi kita tinggal pakai nilai itu dan format jadi JSON.
    const status = set.status && set.status !== 200 ? set.status : 500;
    set.status = status;

    if (status === 500) {
      console.error("Unhandled error:", error);
      return { message: "Terjadi kesalahan pada server" };
    }

    return { message: error.message || "Terjadi kesalahan" };
  })
  .use(healthController)
  .use(authController)
  .use(videoController)
  .use(genreController)
  .listen(PORT);

console.log(
  `🦊 Mediaflow API is running at ${app.server?.hostname}:${app.server?.port}`
);