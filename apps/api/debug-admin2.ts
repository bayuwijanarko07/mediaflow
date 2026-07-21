// Debug - apakah masalah di requireAuth saat dipanggil via requireAdmin?
import { Elysia } from 'elysia';
import { requireAuth } from './src/middleware/auth.middleware';
import { requireAdmin } from './src/modules/auth/admin.middleware';
import { prisma } from '@mediaflow/database';
import { SignJWT } from 'jose';

// Buat user admin
const email = `debug-admin3-${Date.now()}@mediaflow.dev`;
await prisma.user.create({
  data: { email, passwordHash: 'dummy', role: 'ADMIN' }
});
const user = await prisma.user.findUnique({ where: { email } });

// Sign token dengan @elysiajs/jwt style (melalui authController)
import { authController } from './src/modules/auth/auth.controller';
const loginResp = await authController.handle(new Request('http://localhost/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'dummy' }) // ini akan gagal login tapi kita bisa test jwt sign
}));
console.log('Login attempt status:', loginResp.status);

// Buat token via login yang benar - perlu password hash
// Update password
import { hashPassword } from './src/modules/auth/auth.service';
const hash = await hashPassword('SuperSecret123!');
await prisma.user.update({ where: { email }, data: { passwordHash: hash } });

const loginResp2 = await authController.handle(new Request('http://localhost/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'SuperSecret123!' })
}));
console.log('Login2 status:', loginResp2.status);
const loginData = await loginResp2.json();
const accessToken = loginData.accessToken;
console.log('Token from authController:', accessToken?.substring(0, 50));

// Test requireAuth langsung
const authApp = new Elysia().use(requireAuth).get('/test', ({ userId }) => ({ userId }));
const r1 = await authApp.handle(new Request('http://localhost/test', {
  headers: { Authorization: `Bearer ${accessToken}` }
}));
console.log('requireAuth alone:', r1.status, await r1.text());

// Test requireAdmin
const adminApp = new Elysia().use(requireAdmin).get('/test', ({ adminUser }) => ({ role: adminUser.role }));
const r2 = await adminApp.handle(new Request('http://localhost/test', {
  headers: { Authorization: `Bearer ${accessToken}` }
}));
console.log('requireAdmin:', r2.status, await r2.text());

// Cleanup
await prisma.refreshToken.deleteMany({ where: { user: { email } } });
await prisma.user.delete({ where: { email } });
await prisma.$disconnect();
