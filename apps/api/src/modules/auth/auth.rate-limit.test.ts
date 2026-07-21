import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { rateLimit } from "elysia-rate-limit";

// Buat app terisolasi khusus untuk test rate-limit.
// Jangan gunakan authController bersama karena state rate limiter
// in-memory-nya dipakai bersama oleh semua test file yang berjalan paralel.
const rateLimitTestApp = new Elysia()
  .use(
    rateLimit({
      duration: 5000, // 5 detik — cukup untuk satu test run
      max: 5,
      errorResponse: new Response(
        JSON.stringify({ message: "Too many requests" }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      ),
    })
  )
  .post("/auth/login", () => new Response(JSON.stringify({ ok: false }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  }));

describe("Rate limiting pada /auth/login", () => {
  test("request ke-6 dalam window yang sama kena 429", async () => {
    const makeRequest = () =>
      rateLimitTestApp.handle(
        new Request("http://localhost/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "ratelimit-test@mediaflow.dev",
            password: "asal",
          }),
        })
      );

    const responses = [];
    for (let i = 0; i < 6; i++) {
      responses.push(await makeRequest());
    }

    const statuses = responses.map((r) => r.status);
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});