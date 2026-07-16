import { prisma } from "@mediaflow/database";

async function main() {
  const users = await prisma.user.findMany();
  console.log("Users:", users);
}

main();