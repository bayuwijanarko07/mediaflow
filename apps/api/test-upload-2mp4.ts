import { prisma } from "@mediaflow/database";
import { SignJWT } from "jose";

async function main() {
  const filePath = "D:/2.mp4";
  const file = Bun.file(filePath);

  const exists = await file.exists();
  if (!exists) {
    console.error(`❌ File ${filePath} tidak ditemukan.`);
    process.exit(1);
  }

  const fileSize = file.size;
  console.log(`📁 File ditemukan: ${filePath} (${(fileSize / (1024 * 1024)).toFixed(2)} MB)`);

  // 1. Dapatkan atau buat Admin user
  let admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        email: `admin-test-${Date.now()}@mediaflow.dev`,
        passwordHash: "hash-dummy",
        role: "ADMIN",
      },
    });
    console.log("👤 User Admin dibuat:", admin.id);
  } else {
    console.log("👤 User Admin ditemukan:", admin.id, admin.email);
  }

  // 2. Sign JWT token untuk admin
  const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "super-secret-jwt-key-change-me-in-production-min-32-chars");
  const token = await new SignJWT({ sub: admin.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secret);

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const API_URL = "http://localhost:4000";

  // 3. Init Upload
  console.log("\n🚀 Calling /videos/upload/init...");
  const initRes = await fetch(`${API_URL}/videos/upload/init`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      fileName: "2.mp4",
      fileSizeBytes: fileSize,
      title: "Test Upload 2.mp4",
      description: "Testing end-to-end chunk upload file 2.mp4",
    }),
  });

  if (!initRes.ok) {
    console.error(`❌ /upload/init gagal dengan status ${initRes.status}:`, await initRes.text());
    process.exit(1);
  }

  const initData = (await initRes.json()) as {
    uploadId: string;
    chunkSize: number;
    totalChunks: number;
  };

  console.log("✅ Init Sukses:", initData);

  const { uploadId, chunkSize, totalChunks } = initData;
  const arrayBuffer = await file.arrayBuffer();

  // 4. Upload Chunks
  console.log(`\n📤 Uploading ${totalChunks} chunks...`);
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, fileSize);
    const chunkBuffer = arrayBuffer.slice(start, end);

    console.log(`   Uploading chunk ${i + 1}/${totalChunks} (${chunkBuffer.byteLength} bytes)...`);

    const chunkRes = await fetch(`${API_URL}/videos/upload/${uploadId}/chunk/${i}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
      },
      body: chunkBuffer,
    });

    if (!chunkRes.ok) {
      console.error(`❌ Chunk ${i} gagal (${chunkRes.status}):`, await chunkRes.text());
      process.exit(1);
    }
  }

  console.log("✅ Semua chunk berhasil dikirim!");

  // 5. Complete Upload
  console.log("\n🏁 Calling /videos/upload/complete...");
  const completeRes = await fetch(`${API_URL}/videos/upload/${uploadId}/complete`, {
    method: "POST",
    headers: authHeaders,
  });

  if (!completeRes.ok) {
    console.error(`❌ Complete upload gagal dengan status ${completeRes.status}:`, await completeRes.text());
    process.exit(1);
  }

  const completeData = await completeRes.json();
  console.log("🎉 Complete Upload SUKSES!", JSON.stringify(completeData, null, 2));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("💥 Error during test script execution:", err);
  process.exit(1);
});
