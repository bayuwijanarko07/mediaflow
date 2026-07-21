import { authController } from './src/modules/auth/auth.controller';
import { videoController } from './src/modules/video/video.controller';
import { prisma } from '@mediaflow/database';

const email = `debug-admin-${Date.now()}@mediaflow.dev`;

const reg = await authController.handle(new Request('http://localhost/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'SuperSecret123!' })
}));
console.log('Register:', reg.status);

await prisma.user.update({ where: { email }, data: { role: 'ADMIN' } });

const login = await authController.handle(new Request('http://localhost/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'SuperSecret123!' })
}));
const loginData = await login.json();
console.log('Login:', login.status, 'token prefix:', loginData.accessToken?.substring(0,30));

// Decode token header/payload (no verification)
if (loginData.accessToken) {
  const parts = loginData.accessToken.split('.');
  const header = JSON.parse(atob(parts[0]));
  const payload = JSON.parse(atob(parts[1]));
  console.log('Token header:', JSON.stringify(header));
  console.log('Token payload:', JSON.stringify(payload));
}

const video = await videoController.handle(new Request('http://localhost/videos/upload/init', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${loginData.accessToken}`
  },
  body: JSON.stringify({ fileName: 'test.mp4', fileSizeBytes: 1000, title: 'test' })
}));
console.log('Video status:', video.status);
const body = await video.text();
console.log('Video body:', body.substring(0, 500));

// Cleanup
await prisma.refreshToken.deleteMany({ where: { user: { email } } });
await prisma.user.deleteMany({ where: { email } });
await prisma.$disconnect();
