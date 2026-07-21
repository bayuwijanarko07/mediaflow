// Debug apakah masalah ada di JWT verify atau di scoping derive
import { Elysia } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { requireAuth } from './src/middleware/auth.middleware';
import { requireAdmin } from './src/modules/auth/admin.middleware';
import { prisma } from '@mediaflow/database';

// Test 1: JWT sign + verify dengan plugin terpisah
const app1 = new Elysia().use(jwt({ name: 'jwt', secret: process.env.JWT_SECRET! }));
const token = await app1.handle(new Request('http://localhost/')).then(async () => {
  // Simulasi sign
  const Jwt = (await import('@elysiajs/jwt')).jwt;
  const jose = await import('jose');
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const signed = await new jose.SignJWT({ sub: 'test-user-id' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secret);
  return signed;
});
console.log('Manual signed token:', token.substring(0, 50));

// Verify dengan jose langsung
const jose = await import('jose');
const secret = new TextEncoder().encode(process.env.JWT_SECRET);
try {
  const verified = await jose.jwtVerify(token, secret);
  console.log('Manual verify success:', JSON.stringify(verified.payload));
} catch (e) {
  console.log('Manual verify failed:', e);
}

// Test 2: Gunakan requireAuth langsung
const protApp = new Elysia()
  .use(requireAuth)
  .get('/test', ({ userId }) => ({ userId }));

const resp = await protApp.handle(new Request('http://localhost/test', {
  headers: { Authorization: `Bearer ${token}` }
}));
console.log('requireAuth with manual token:', resp.status, await resp.text());

await prisma.$disconnect();
