import { Elysia } from "elysia";
import { redis } from "../../lib/redis";
import { requireAdmin } from "../../modules/auth/admin.middleware";

export const healthController = new Elysia()
  .get("/health", async () => {
  let redisStatus = "unknown";
    try {
      await redis.ping();
      redisStatus = "connected";
    } catch {
      redisStatus = "disconnected";
    }

    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      redis: redisStatus,
    };
  })

  .use(requireAdmin)
  .get("/health/admin-only", ({ adminUser }) => ({
    message: "Kamu berhasil akses route khusus admin",
    admin: adminUser,
  }));

