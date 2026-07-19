import { prisma } from "@mediaflow/database";
import { ensureStorageDirs, getStoragePath, pathExists } from "@mediaflow/storage";

async function main() {
  console.log("🔧 Mediaflow Worker started");

  // Test koneksi Prisma
  const userCount = await prisma.user.count();
  console.log(`✅ Database OK. Jumlah user: ${userCount}`);

  // Test akses storage
  await ensureStorageDirs();
  const hlsDir = getStoragePath("hls");
  console.log(`✅ Storage OK. Folder HLS ada: ${pathExists(hlsDir)}`);

  console.log("Menunggu job dari transcode-queue... (BullMQ akan ditambahkan di Issue #30)");
}

main();