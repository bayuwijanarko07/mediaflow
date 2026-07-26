import { describe, expect, test, afterEach } from "bun:test";
import { prisma } from "@mediaflow/database";
import {
  recordLoginAttempt,
  getLoginAuditLogsForUser,
  getAllLoginAuditLogs,
} from "./audit-log.service";

describe("Login audit log service", () => {
  const testEmail = `audit-service-${Date.now()}@mediaflow.dev`;
  let createdUserId: string | null = null;

  afterEach(async () => {
    await prisma.loginAuditLog.deleteMany({ where: { email: testEmail } });
    if (createdUserId) {
      await prisma.user.deleteMany({ where: { id: createdUserId } });
      createdUserId = null;
    }
  });

  test("recordLoginAttempt menyimpan log sukses dengan userId", async () => {
    const user = await prisma.user.create({
      data: { email: testEmail, passwordHash: "dummy" },
    });
    createdUserId = user.id;

    await recordLoginAttempt({
      email: testEmail,
      success: true,
      userId: user.id,
      ipAddress: "127.0.0.1",
      userAgent: "TestAgent/1.0",
    });

    const logs = await getLoginAuditLogsForUser(user.id);
    expect(logs.length).toBe(1);
    expect(logs[0].success).toBe(true);
    expect(logs[0].ipAddress).toBe("127.0.0.1");
    expect(logs[0].userAgent).toBe("TestAgent/1.0");
  });

  test("recordLoginAttempt menyimpan log gagal TANPA userId (email tidak terdaftar)", async () => {
    await recordLoginAttempt({
      email: testEmail,
      success: false,
      ipAddress: "10.0.0.5",
      userAgent: "AttackerAgent/1.0",
    });

    const result = await getAllLoginAuditLogs({ page: 1, limit: 10, email: testEmail });
    expect(result.logs.length).toBe(1);
    expect(result.logs[0].success).toBe(false);
    expect(result.logs[0].userId).toBeNull();
  });

  test("getAllLoginAuditLogs filter success=false hanya return percobaan gagal", async () => {
    await recordLoginAttempt({ email: testEmail, success: true, ipAddress: "1.1.1.1" });
    await recordLoginAttempt({ email: testEmail, success: false, ipAddress: "2.2.2.2" });

    const result = await getAllLoginAuditLogs({
      page: 1,
      limit: 10,
      email: testEmail,
      success: false,
    });

    expect(result.logs.every((l) => l.success === false)).toBe(true);
  });

  test("recordLoginAttempt tidak throw meski userId invalid (fail-safe)", async () => {
    let didThrow = false;
    try {
      await recordLoginAttempt({
        email: testEmail,
        success: true,
        userId: "user-id-tidak-ada",
      });
    } catch {
      didThrow = true;
    }

    // Fungsi ini sengaja swallow error internal (lihat komentar di service),
    // jadi TIDAK boleh throw ke pemanggil meski insert gagal karena FK invalid
    expect(didThrow).toBe(false);
  });
});