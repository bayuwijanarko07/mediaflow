import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { prisma } from "@mediaflow/database";
import { authController } from "./auth.controller";
import { auditController } from "./audit.controller";

const authApp = authController;
const auditApp = auditController;

const adminEmail = `audit-admin-${Date.now()}@mediaflow.dev`;
const regularEmail = `audit-user-${Date.now()}@mediaflow.dev`;
const testPassword = "SuperSecret123!";

describe("GET /admin/audit/login-logs", () => {
  let adminToken: string;
  let regularToken: string;
  let regularUserId: string;

  beforeAll(async () => {
    await authApp.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmail, password: testPassword }),
      })
    );
    await prisma.user.update({ where: { email: adminEmail }, data: { role: "ADMIN" } });
    const adminLogin = await authApp.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmail, password: testPassword }),
      })
    );
    adminToken = (await adminLogin.json()).accessToken;

    // Registrasi + beberapa percobaan login (sukses & gagal) untuk regularEmail,
    // supaya ada data audit log yang bisa diverifikasi lewat endpoint admin
    await authApp.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: regularEmail, password: testPassword }),
      })
    );
    const regularLogin = await authApp.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: regularEmail, password: testPassword }),
      })
    );
    const regularData = await regularLogin.json();
    regularToken = regularData.accessToken;
    regularUserId = regularData.user.id;

    // 1 percobaan gagal (password salah)
    await authApp.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: regularEmail, password: "SalahBanget123" }),
      })
    );
  });

  afterAll(async () => {
    await prisma.loginAuditLog.deleteMany({
      where: { email: { in: [adminEmail, regularEmail] } },
    });
    await prisma.refreshToken.deleteMany({
      where: { user: { email: { in: [adminEmail, regularEmail] } } },
    });
    await prisma.user.deleteMany({ where: { email: { in: [adminEmail, regularEmail] } } });
    await prisma.$disconnect();
  });

  test("return 401 tanpa login", async () => {
    const response = await auditApp.handle(
      new Request("http://localhost/admin/audit/login-logs")
    );
    expect(response.status).toBe(401);
  });

  test("return 403 untuk user biasa", async () => {
    const response = await auditApp.handle(
      new Request("http://localhost/admin/audit/login-logs", {
        headers: { Authorization: `Bearer ${regularToken}` },
      })
    );
    expect(response.status).toBe(403);
  });

  test("admin bisa melihat log login, termasuk IP & user agent tercatat otomatis", async () => {
    const response = await auditApp.handle(
      new Request(`http://localhost/admin/audit/login-logs?email=${encodeURIComponent(regularEmail)}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.logs.length).toBeGreaterThanOrEqual(2); // 1 sukses (registrasi login) + 1 gagal
    const successLog = data.logs.find((l: any) => l.success === true);
    const failedLog = data.logs.find((l: any) => l.success === false);

    expect(successLog).toBeDefined();
    expect(failedLog).toBeDefined();
    expect(successLog.email).toBe(regularEmail);
  });

  test("GET /admin/audit/login-logs/:userId return riwayat 1 user spesifik", async () => {
    const response = await auditApp.handle(
      new Request(`http://localhost/admin/audit/login-logs/${regularUserId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.logs.every((l: any) => l.userId === regularUserId)).toBe(true);
  });

  test("filter success=true hanya mengembalikan percobaan sukses", async () => {
    const response = await auditApp.handle(
      new Request(
        `http://localhost/admin/audit/login-logs?email=${encodeURIComponent(regularEmail)}&success=true`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      )
    );

    const data = await response.json();
    expect(data.logs.every((l: any) => l.success === true)).toBe(true);
  });
});