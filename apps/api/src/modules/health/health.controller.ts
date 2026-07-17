import { Elysia } from "elysia";
import { requireAuth } from "../../middleware/auth.middleware";

export const healthController = new Elysia()
  .get("/health", () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }))
  .use(requireAuth)
  .get("/health/protected", ({ userId }) => ({
    message: "Kamu berhasil akses route protected",
    userId,
  }));