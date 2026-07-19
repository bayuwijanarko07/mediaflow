import { redis } from "bun";

/**
 * Bun native Redis client — otomatis baca REDIS_URL dari environment,
 * tidak perlu konfigurasi koneksi manual. Auto-reconnect dengan
 * exponential backoff sudah built-in.
 */
export { redis };