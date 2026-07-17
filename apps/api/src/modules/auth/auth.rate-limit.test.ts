import { describe, expect, test } from "bun:test";
import { authController } from "./auth.controller";

const app = authController;

describe("Rate limiting pada /auth/login", () => {
  test("request ke-6 dalam window yang sama kena 429", async () => {
    const makeRequest = () =>
      app.handle(
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