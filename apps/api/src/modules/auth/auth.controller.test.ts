import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { prisma } from "@mediaflow/database";
import { authController } from "./auth.controller";

const app = authController;

// Gunakan email unik per test run supaya tidak bentrok kalau test diulang
const testEmail = `test-${Date.now()}@mediaflow.dev`;

describe("POST /auth/register", () => {
  afterAll(async () => {
    // Bersihkan data test
    await prisma.user.deleteMany({
      where: { email: { contains: "@mediaflow.dev" } },
    });
    await prisma.$disconnect();
  });

  test("register sukses dengan data valid", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          password: "SuperSecret123!",
          name: "Test User",
        }),
      })
    );

    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.user.email).toBe(testEmail);
    expect(data.user.passwordHash).toBeUndefined();
  });

  test("register gagal untuk email duplikat", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: testEmail,
          password: "SuperSecret123!",
        }),
      })
    );

    expect(response.status).toBe(409);
  });

  test("register gagal untuk password lemah", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `weak-${Date.now()}@mediaflow.dev`,
          password: "123",
        }),
      })
    );

    expect(response.status).toBe(422);
  });

  test("register gagal untuk format email tidak valid", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "bukan-email",
          password: "SuperSecret123!",
        }),
      })
    );

    expect(response.status).toBe(422);
  });
});