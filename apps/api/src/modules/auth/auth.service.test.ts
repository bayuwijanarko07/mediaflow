import { describe, expect, test } from "bun:test";
import { hashPassword, verifyPassword } from "./auth.service";

describe("Password hashing", () => {
  test("hash tidak sama dengan plaintext", async () => {
    const password = "SuperSecret123!";
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(hash.length).toBeGreaterThan(0);
  });

  test("hash yang sama untuk password sama tetap unik tiap kali (karena salt)", async () => {
    const password = "SuperSecret123!";
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    // Argon2 otomatis pakai salt acak, jadi hash tidak akan pernah identik
    expect(hash1).not.toBe(hash2);
  });

  test("verify berhasil untuk password yang benar", async () => {
    const password = "SuperSecret123!";
    const hash = await hashPassword(password);

    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);
  });

  test("verify gagal untuk password yang salah", async () => {
    const password = "SuperSecret123!";
    const wrongPassword = "WrongPassword456!";
    const hash = await hashPassword(password);

    const isValid = await verifyPassword(wrongPassword, hash);
    expect(isValid).toBe(false);
  });

  test("verify gagal untuk password kosong", async () => {
    const password = "SuperSecret123!";
    const hash = await hashPassword(password);

    const isValid = await verifyPassword("", hash);
    expect(isValid).toBe(false);
  });
});