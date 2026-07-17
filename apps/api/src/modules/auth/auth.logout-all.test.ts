import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { prisma } from "@mediaflow/database";
import { authController } from "./auth.controller";

const app = authController;
const testEmail = `logout-all-test-${Date.now()}@mediaflow.dev`;
const testPassword = "SuperSecret123!";

function extractRefreshToken(setCookieHeader: string | null) {
  if (!setCookieHeader) return null;
  return setCookieHeader.match(/refresh_token=([^;]+)/)?.[1] ?? null;
}

describe("POST /auth/logout-all", () => {
  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { user: { email: testEmail } } });
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await prisma.$disconnect();
  });

  test("revoke semua refresh token milik user dari 2 sesi login berbeda", async () => {
    await app.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      })
    );

    const login1 = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      })
    );
    const login1Data = await login1.json();
    const refreshToken1 = extractRefreshToken(login1.headers.get("set-cookie"))!;

    const login2 = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      })
    );
    const refreshToken2 = extractRefreshToken(login2.headers.get("set-cookie"))!;

    const logoutAllResponse = await app.handle(
      new Request("http://localhost/auth/logout-all", {
        method: "POST",
        headers: { Authorization: `Bearer ${login1Data.accessToken}` },
      })
    );
    expect(logoutAllResponse.status).toBe(200);

    const refreshAttempt1 = await app.handle(
      new Request("http://localhost/auth/refresh", {
        method: "POST",
        headers: { Cookie: `refresh_token=${refreshToken1}` },
      })
    );
    const refreshAttempt2 = await app.handle(
      new Request("http://localhost/auth/refresh", {
        method: "POST",
        headers: { Cookie: `refresh_token=${refreshToken2}` },
      })
    );

    expect(refreshAttempt1.status).toBe(401);
    expect(refreshAttempt2.status).toBe(401);
  });
});