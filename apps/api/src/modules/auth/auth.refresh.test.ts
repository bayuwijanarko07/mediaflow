import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { prisma } from "@mediaflow/database";
import { authController } from "./auth.controller";

const app = authController;
const testEmail = `refresh-test-${Date.now()}@mediaflow.dev`;
const testPassword = "SuperSecret123!";

function extractRefreshTokenFromSetCookie(setCookieHeader: string | null) {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(/refresh_token=([^;]+)/);
  return match ? match[1] : null;
}

describe("POST /auth/refresh", () => {
  let initialRefreshToken: string;

  beforeAll(async () => {
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

    initialRefreshToken = extractRefreshTokenFromSetCookie(
      loginResponse.headers.get("set-cookie")
    )!;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({
      where: { user: { email: testEmail } },
    });
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await prisma.$disconnect();
  });

  test("refresh sukses dan menghasilkan access token + refresh token baru", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/refresh", {
        method: "POST",
        headers: { Cookie: `refresh_token=${initialRefreshToken}` },
      })
    );

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.accessToken).toBeDefined();

    const newRefreshToken = extractRefreshTokenFromSetCookie(
      response.headers.get("set-cookie")
    );
    expect(newRefreshToken).toBeDefined();
    expect(newRefreshToken).not.toBe(initialRefreshToken);
  });

  test("refresh token lama yang sudah dipakai tidak bisa dipakai lagi (rotation)", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/refresh", {
        method: "POST",
        headers: { Cookie: `refresh_token=${initialRefreshToken}` },
      })
    );

    expect(response.status).toBe(401);
  });

  test("refresh tanpa cookie return 401", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/refresh", { method: "POST" })
    );

    expect(response.status).toBe(401);
  });

  test("refresh dengan token acak/tidak dikenal return 401", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/refresh", {
        method: "POST",
        headers: { Cookie: `refresh_token=${crypto.randomUUID()}` },
      })
    );

    expect(response.status).toBe(401);
  });

  test("refresh token yang sudah expired ditolak", async () => {
    // Buat refresh token dengan expiresAt di masa lalu
    const user = await prisma.user.findUnique({ where: { email: testEmail } });
    if (!user) {
      throw new Error(`User ${testEmail} tidak ditemukan di database — pastikan register berhasil di beforeAll`);
    }
    const expiredToken = crypto.randomUUID();

    await prisma.refreshToken.create({
            data: {
            token: expiredToken,
            userId: user.id,
            expiresAt: new Date(Date.now() - 1000), // sudah lewat 1 detik yang lalu
        },
    });

    const response = await app.handle(
        new Request("http://localhost/auth/refresh", {
            method: "POST",
            headers: { Cookie: `refresh_token=${expiredToken}` },
        })
    );

        expect(response.status).toBe(401);
    });
});