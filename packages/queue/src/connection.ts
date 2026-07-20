import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

/**
 * Buat koneksi Redis baru khusus untuk 1 instance Queue/Worker BullMQ.
 *
 * PENTING: setiap Queue dan Worker BullMQ sebaiknya punya koneksi
 * Redis SENDIRI (bukan di-share satu object yang sama).
 *
 * maxRetriesPerRequest: null WAJIB untuk BullMQ Worker — tanpa ini,
 * BullMQ akan throw error saat Worker instance dibuat, karena Worker
 * butuh command blocking yang harus retry selamanya sampai ada job baru,
 * bukan menyerah setelah beberapa kali percobaan.
 */
export function createQueueConnection() {
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
  });
}