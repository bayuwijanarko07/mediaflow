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