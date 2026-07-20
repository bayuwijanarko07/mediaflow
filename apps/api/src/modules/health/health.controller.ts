import { Elysia } from "elysia";
import { redis } from "../../lib/redis";

export const healthController = new Elysia().get("/health", async () => {
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
});