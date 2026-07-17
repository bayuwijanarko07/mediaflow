import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { Elysia } from "elysia";
import { prisma } from "@mediaflow/database";
import { authController } from "../modules/auth/auth.controller";
import { requireAuth } from "./auth.middleware";

const authApp = authController;

// App dummy khusus test middleware, terisolasi dari route lain
const protectedApp = new Elysia()
  .use(requireAuth)
  .get("/protected", ({ userId }) => ({ userId }));

const testEmail = `middleware-test-${Date.now()}@mediaflow.dev`;
const testPassword = "SuperSecret123!";

describe("requireAuth middleware", () => {
  let validAccessToken: string;
  let expectedUserId: string;

  beforeAll(async () => {
    await authApp.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      })
    );

    const loginResponse = await authApp.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      })
    );

    const loginData = await loginResponse.json();
    validAccessToken = loginData.accessToken;
    expectedUserId = loginData.user.id;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({
      where: { user: { email: testEmail } },
    });
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await prisma.$disconnect();
  });

  test("return 401 tanpa header Authorization", async () => {
    const response = await protectedApp.handle(
      new Request("http://localhost/protected")
    );

    expect(response.status).toBe(401);
  });

  test("return 401 dengan token invalid", async () => {
    const response = await protectedApp.handle(
      new Request("http://localhost/protected", {
        headers: { Authorization: "Bearer token-asal-asalan" },
      })
    );

    expect(response.status).toBe(401);
  });

  test("return 401 dengan format header salah (tanpa Bearer)", async () => {
    const response = await protectedApp.handle(
      new Request("http://localhost/protected", {
        headers: { Authorization: validAccessToken },
      })
    );

    expect(response.status).toBe(401);
  });

  test("berhasil akses dengan token valid, userId sesuai", async () => {
    const response = await protectedApp.handle(
      new Request("http://localhost/protected", {
        headers: { Authorization: `Bearer ${validAccessToken}` },
      })
    );

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.userId).toBe(expectedUserId);
  });
});