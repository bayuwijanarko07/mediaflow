import { prisma } from "@mediaflow/database";
import { hashPassword } from "./src/modules/auth/auth.service";

async function main() {
  const email = "admin@mediaflow.dev";
  const password = "Admin123!";

  const passwordHash = await hashPassword(password);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: "ADMIN",
    },
    create: {
      email,
      name: "Admin Tester",
      passwordHash,
      role: "ADMIN",
    },
  });

  console.log("✅ Admin user ready:", admin.email, "(Role:", admin.role, ")");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Error seeding admin:", err);
  process.exit(1);
});
