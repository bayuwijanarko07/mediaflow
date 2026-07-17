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

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Email atau password salah");
    this.name = "InvalidCredentialsError";
  }
}

const REFRESH_TOKEN_EXPIRY_DAYS = Number(
  process.env.REFRESH_TOKEN_EXPIRY_DAYS ?? 7
);

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export async function createRefreshToken(userId: string) {
  const token = crypto.randomUUID();
  const expiresAt = new Date(
    Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  );

  await prisma.refreshToken.create({
    data: { token, userId, expiresAt },
  });

  return { token, expiresAt };
}

export function getRefreshTokenMaxAgeSeconds() {
  return REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60;
}

export class InvalidRefreshTokenError extends Error {
  constructor() {
    super("Refresh token tidak valid atau sudah kedaluwarsa");
    this.name = "InvalidRefreshTokenError";
  }
}

export async function rotateRefreshToken(oldToken: string) {
  const existingToken = await prisma.refreshToken.findUnique({
    where: { token: oldToken },
    include: { user: true },
  });

  // Validasi: token ada, belum revoked, belum expired
  if (
    !existingToken ||
    existingToken.revoked ||
    existingToken.expiresAt < new Date()
  ) {
    throw new InvalidRefreshTokenError();
  }

  // Revoke token lama (rotation) — dilakukan dalam transaction
  // bersamaan dengan pembuatan token baru, supaya atomic
  const newToken = crypto.randomUUID();
  const expiresAt = new Date(
    Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  );

  const [, createdToken] = await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: existingToken.id },
      data: { revoked: true },
    }),
    prisma.refreshToken.create({
      data: {
        token: newToken,
        userId: existingToken.userId,
        expiresAt,
      },
    }),
  ]);

  return {
    newRefreshToken: createdToken.token,
    user: existingToken.user,
  };
}