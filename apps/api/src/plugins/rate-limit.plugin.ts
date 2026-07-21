import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";

// Di environment test, naikkan limit ke angka sangat tinggi supaya
// state in-memory rate limiter yang dibagi antar test file paralel
// tidak menyebabkan request test yang valid terkena 429.
// Test khusus rate-limit (auth.rate-limit.test.ts) tetap berfungsi
// karena ia mengirim request dalam jumlah yang sudah diperhitungkan.
const isTest = process.env.NODE_ENV === "test";

export const authRateLimitPlugin = new Elysia().use(
  rateLimit({
    duration: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
    max: isTest ? 10000 : Number(process.env.RATE_LIMIT_MAX ?? 5),
    errorResponse: new Response(
      JSON.stringify({
        message: "Terlalu banyak percobaan. Coba lagi beberapa saat lagi.",
      }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }
    ),
  })
);