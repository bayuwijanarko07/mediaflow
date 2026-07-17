import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { prisma } from "@mediaflow/database";
import { authController } from "./auth.controller";

const app = authController;
const testEmail = `login-test-${Date.now()}@mediaflow.dev`;
const testPassword = "SuperSecret123!";

describe("POST /auth/login", () => {
  beforeAll(async () => {
    // Setup: register user dulu sebelum test login
    await app.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      })
    );
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({
      where: { user: { email: testEmail } },
    });
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await prisma.$disconnect();
  });

  test("login sukses dengan kredensial benar", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      })
    );

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.accessToken).toBeDefined();
    expect(data.user.email).toBe(testEmail);

    const setCookieHeader = response.headers.get("set-cookie");
    expect(setCookieHeader).toContain("refresh_token=");
    expect(setCookieHeader).toContain("HttpOnly");
  });

  test("login gagal dengan password salah", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail, password: "SalahPassword" }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("login gagal dengan email tidak terdaftar", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "tidakada@mediaflow.dev",
          password: testPassword,
        }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("refresh token tersimpan di database setelah login", async () => {
    const user = await prisma.user.findUnique({ where: { email: testEmail } });
    const tokenCount = await prisma.refreshToken.count({
      where: { userId: user?.id },
    });

    expect(tokenCount).toBeGreaterThan(0);
  });
});