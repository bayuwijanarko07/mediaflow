/**
 * Duplikasi tipis dari apps/api/src/modules/auth/auth.service.ts.
 * Sengaja terpisah supaya packages/database tidak punya dependency
 * ke apps/api (arah dependency yang salah dalam arsitektur monorepo).
 */
export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, {
    algorithm: "argon2id",
    memoryCost: 19456,
    timeCost: 2,
  });
}