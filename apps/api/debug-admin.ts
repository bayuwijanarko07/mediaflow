// Debug apakah requireAdmin bekerja dengan token yang valid
import { Elysia } from 'elysia';
import { requireAdmin } from './src/modules/auth/admin.middleware';
import { prisma } from '@mediaflow/database';
import { SignJWT } from 'jose';

// Buat user admin di database
const email = `debug-admin2-${Date.now()}@mediaflow.dev`;
await prisma.user.create({
  data: {
    email,
    passwordHash: 'dummy',
    role: 'ADMIN',
  }
});
const user = await prisma.user.findUnique({ where: { email } });
console.log('Created admin user:', user?.id, user?.role);

// Sign token manual dengan jose
const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const token = await new SignJWT({ sub: user!.id })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setExpirationTime('15m')
  .sign(secret);
console.log('Token signed for userId:', user?.id);

// Test requireAdmin
const adminApp = new Elysia()
  .use(requireAdmin)
  .get('/admin', ({ adminUser }) => ({ role: adminUser.role }));

const resp = await adminApp.handle(new Request('http://localhost/admin', {
  headers: { Authorization: `Bearer ${token}` }
}));
console.log('requireAdmin status:', resp.status, await resp.text());

// Cleanup
await prisma.user.delete({ where: { email } }).catch(() => {});
await prisma.$disconnect();
