import { prisma } from "../src/index";
import { hashPassword } from "./seed-helpers";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@mediaflow.dev";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "AdminPassword123!";

async function main() {
  console.log("🌱 Menjalankan seed...\n");

  const existingAdmin = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
  });

  if (existingAdmin) {
    if (existingAdmin.role !== "ADMIN") {
      await prisma.user.update({
        where: { id: existingAdmin.id },
        data: { role: "ADMIN" },
      });
      console.log(`✅ User existing "${ADMIN_EMAIL}" di-upgrade jadi ADMIN`);
    } else {
      console.log(`ℹ️  User "${ADMIN_EMAIL}" sudah ADMIN, tidak ada perubahan`);
    }
    return;
  }

  const passwordHash = await hashPassword(ADMIN_PASSWORD);

  const admin = await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      passwordHash,
      name: "Admin Mediaflow",
      role: "ADMIN",
      isVerified: true,
    },
  });

  console.log(`✅ Admin baru dibuat:`);
  console.log(`   Email: ${admin.email}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);
  console.log(`\n⚠️  Segera ganti password ini setelah login pertama kali.`);
}

main()
  .catch((error) => {
    console.error("❌ Seed gagal:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });