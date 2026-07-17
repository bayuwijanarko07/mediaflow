import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { prisma } from "@mediaflow/database";
import { authController } from "./auth.controller";

const app = authController;
const testEmail = `me-test-${Date.now()}@mediaflow.dev`;
const testPassword = "SuperSecret123!";

describe("GET /auth/me", () => {
  let accessToken: string;

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

    const data = await loginResponse.json();
    accessToken = data.accessToken;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { user: { email: testEmail } } });
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await prisma.$disconnect();
  });

  test("return 401 tanpa token", async () => {
    const response = await app.handle(new Request("http://localhost/auth/me"));
    expect(response.status).toBe(401);
  });

  test("return data user dengan token valid, tanpa passwordHash", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    );

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.user.email).toBe(testEmail);
    expect(data.user.passwordHash).toBeUndefined();
  });
});