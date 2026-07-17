/**
 * Hash password menggunakan argon2id (algoritma default & paling direkomendasikan
 * saat ini oleh OWASP untuk password hashing).
 */
export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, {
    algorithm: "argon2id",
    memoryCost: 19456, // ~19 MB, sesuai rekomendasi OWASP
    timeCost: 2,
  });
}

/**
 * Verifikasi password plaintext terhadap hash yang tersimpan di database.
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return Bun.password.verify(password, hash);
}

import { prisma } from "@mediaflow/database";

export class EmailAlreadyExistsError extends Error {
  constructor() {
    super("Email sudah terdaftar");
    this.name = "EmailAlreadyExistsError";
  }
}

export async function registerUser(params: {
  email: string;
  password: string;
  name?: string;
}) {
  const existingUser = await prisma.user.findUnique({
    where: { email: params.email },
  });

  if (existingUser) {
    throw new EmailAlreadyExistsError();
  }

  const passwordHash = await hashPassword(params.password);

  const user = await prisma.user.create({
    data: {
      email: params.email,
      passwordHash,
      name: params.name,
    },
    select: {
      id: true,
      email: true,
      name: true,
      isVerified: true,
      createdAt: true,
      // passwordHash sengaja TIDAK di-select, tidak pernah keluar ke response
    },
  });

  return user;
}