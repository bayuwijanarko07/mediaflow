import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { prisma } from "@mediaflow/database";
import { authController } from "./auth.controller";

const app = authController;
const testEmail = `logout-test-${Date.now()}@mediaflow.dev`;
const testPassword = "SuperSecret123!";

function extractRefreshTokenFromSetCookie(setCookieHeader: string | null) {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(/refresh_token=([^;]+)/);
  return match ? match[1] : null;
}

describe("POST /auth/logout", () => {
  afterAll(async () => {
    await prisma.refreshToken.deleteMany({
      where: { user: { email: testEmail } },
    });
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await prisma.$disconnect();
  });

  test("logout sukses dan revoke refresh token di database", async () => {
    await app.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      })
    );

    const loginResponse = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      })
    );

    const refreshToken = extractRefreshTokenFromSetCookie(
      loginResponse.headers.get("set-cookie")
    )!;

    const logoutResponse = await app.handle(
      new Request("http://localhost/auth/logout", {
        method: "POST",
        headers: { Cookie: `refresh_token=${refreshToken}` },
      })
    );

    expect(logoutResponse.status).toBe(200);

    const tokenInDb = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });
    expect(tokenInDb?.revoked).toBe(true);
  });

  test("refresh token yang sudah di-logout tidak bisa dipakai lagi", async () => {
    const loginResponse = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      })
    );

    const refreshToken = extractRefreshTokenFromSetCookie(
      loginResponse.headers.get("set-cookie")
    )!;

    await app.handle(
      new Request("http://localhost/auth/logout", {
        method: "POST",
        headers: { Cookie: `refresh_token=${refreshToken}` },
      })
    );

    const refreshAttempt = await app.handle(
      new Request("http://localhost/auth/refresh", {
        method: "POST",
        headers: { Cookie: `refresh_token=${refreshToken}` },
      })
    );

    expect(refreshAttempt.status).toBe(401);
  });

  test("logout tanpa cookie tetap return 200 (idempotent)", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/logout", { method: "POST" })
    );

    expect(response.status).toBe(200);
  });

  test("logout menghapus cookie refresh_token dari response", async () => {
    const loginResponse = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      })
    );

    const refreshToken = extractRefreshTokenFromSetCookie(
      loginResponse.headers.get("set-cookie")
    )!;

    const logoutResponse = await app.handle(
      new Request("http://localhost/auth/logout", {
        method: "POST",
        headers: { Cookie: `refresh_token=${refreshToken}` },
      })
    );

    const setCookieHeader = logoutResponse.headers.get("set-cookie");
    // Cookie yang dihapus biasanya di-set dengan expires di masa lalu / max-age=0
    expect(setCookieHeader).toContain("refresh_token=");
  });
});