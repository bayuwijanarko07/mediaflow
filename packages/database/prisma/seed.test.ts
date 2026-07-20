import { describe, expect, test, afterEach } from "bun:test";
import { prisma } from "../src/index";
import { hashPassword } from "./seed-helpers";

describe("Seed admin logic", () => {
  const testEmail = `seed-test-${Date.now()}@mediaflow.dev`;

  afterEach(async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } });
  });

  test("user baru dibuat dengan role ADMIN", async () => {
    const passwordHash = await hashPassword("TestPassword123!");

    const admin = await prisma.user.create({
      data: {
        email: testEmail,
        passwordHash,
        role: "ADMIN",
        isVerified: true,
      },
    });

    expect(admin.role).toBe("ADMIN");
  });

  test("user default (tanpa role eksplisit) otomatis dapat role USER", async () => {
    const passwordHash = await hashPassword("TestPassword123!");

    const user = await prisma.user.create({
      data: {
        email: testEmail,
        passwordHash,
        // role sengaja tidak diisi, harus fallback ke default
      },
    });

    expect(user.role).toBe("USER");
  });

  test("bisa upgrade user existing dari USER ke ADMIN", async () => {
    const passwordHash = await hashPassword("TestPassword123!");

    const user = await prisma.user.create({
      data: { email: testEmail, passwordHash },
    });

    expect(user.role).toBe("USER");

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { role: "ADMIN" },
    });

    expect(updated.role).toBe("ADMIN");
  });
});