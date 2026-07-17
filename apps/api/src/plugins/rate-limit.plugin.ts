import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";

export const authRateLimitPlugin = new Elysia().use(
  rateLimit({
    duration: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000),
    max: Number(process.env.RATE_LIMIT_MAX ?? 5),
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