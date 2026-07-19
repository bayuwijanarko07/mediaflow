import { describe, expect, test } from "bun:test";
import { prisma } from "@mediaflow/database";
import { ensureStorageDirs, pathExists, getStoragePath } from "@mediaflow/storage";

describe("Worker dependencies", () => {
  test("bisa import dan konek ke Prisma dari apps/worker", async () => {
    const result = await prisma.$queryRaw`SELECT 1 as result`;
    expect(result).toBeDefined();
  });

  test("bisa import dan jalankan ensureStorageDirs dari apps/worker", async () => {
    await ensureStorageDirs();
    expect(pathExists(getStoragePath("hls"))).toBe(true);
    expect(pathExists(getStoragePath("raw-temp"))).toBe(true);
    expect(pathExists(getStoragePath("uploads-temp"))).toBe(true);
  });
});