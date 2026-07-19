import { describe, expect, test, afterAll } from "bun:test";
import { redis } from "./redis";

describe("Redis connection", () => {
  const testKey = "mediaflow:test:connection-check";

  afterAll(async () => {
    await redis.del(testKey);
  });

  test("bisa set dan get value", async () => {
    await redis.set(testKey, "test-value");
    const value = await redis.get(testKey);

    expect(value).toBe("test-value");
  });

  test("exists return true untuk key yang ada, false untuk yang tidak", async () => {
    await redis.set(testKey, "test-value");

    const existsAfterSet = await redis.exists(testKey);
    expect(existsAfterSet).toBe(true);

    await redis.del(testKey);

    const existsAfterDel = await redis.exists(testKey);
    expect(existsAfterDel).toBe(false);
  });

  test("bisa set value dengan TTL (expiry)", async () => {
    await redis.set(testKey, "expiring-value", "EX", 60);
    const ttl = await redis.ttl(testKey);

    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });
});