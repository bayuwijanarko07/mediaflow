import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { Elysia } from "elysia";
import { prisma } from "@mediaflow/database";
import { authController } from "../modules/auth/auth.controller";
import { requireAdmin } from "../modules/auth/admin.middleware";

const authApp = authController;

const adminOnlyApp = new Elysia()
  .use(requireAdmin)
  .get("/admin-only", ({ adminUser }) => ({ role: adminUser.role }));

const regularUserEmail = `regular-${Date.now()}@mediaflow.dev`;
const adminUserEmail = `admin-${Date.now()}@mediaflow.dev`;
const testPassword = "SuperSecret123!";

describe("requireAdmin middleware", () => {
  let regularUserToken: string;
  let adminUserToken: string;

  beforeAll(async () => {
    // Setup user biasa
    await authApp.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: regularUserEmail, password: testPassword }),
      })
    );
    const regularLogin = await authApp.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: regularUserEmail, password: testPassword }),
      })
    );
    const regularData = await regularLogin.json();
    regularUserToken = regularData.accessToken;

    // Setup user admin
    await authApp.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminUserEmail, password: testPassword }),
      })
    );
    await prisma.user.update({
      where: { email: adminUserEmail },
      data: { role: "ADMIN" },
    });
    const adminLogin = await authApp.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminUserEmail, password: testPassword }),
      })
    );
    const adminData = await adminLogin.json();
    adminUserToken = adminData.accessToken;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({
      where: { user: { email: { in: [regularUserEmail, adminUserEmail] } } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [regularUserEmail, adminUserEmail] } },
    });
    await prisma.$disconnect();
  });

  test("return 401 tanpa login sama sekali", async () => {
    const response = await adminOnlyApp.handle(
      new Request("http://localhost/admin-only")
    );

    expect(response.status).toBe(401);
  });

  test("return 403 kalau login tapi bukan admin", async () => {
    const response = await adminOnlyApp.handle(
      new Request("http://localhost/admin-only", {
        headers: { Authorization: `Bearer ${regularUserToken}` },
      })
    );

    expect(response.status).toBe(403);
  });

  test("lolos (200) kalau login sebagai admin", async () => {
    const response = await adminOnlyApp.handle(
      new Request("http://localhost/admin-only", {
        headers: { Authorization: `Bearer ${adminUserToken}` },
      })
    );

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.role).toBe("ADMIN");
  });
});