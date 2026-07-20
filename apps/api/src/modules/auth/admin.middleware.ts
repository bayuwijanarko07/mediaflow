import { Elysia } from "elysia";
import { requireAuth } from "../../middleware/auth.middleware";
import { getUserById } from "../../modules/auth/auth.service";

export const requireAdmin = new Elysia()
  .use(requireAuth)
  .derive({ as: "scoped" }, async ({ userId, set }) => {
    if (!userId) {
      set.status = 401;
      throw new Error("Unauthorized: token tidak valid");
    }

    const user = await getUserById(userId);

    if (!user) {
      set.status = 401;
      throw new Error("Unauthorized: user tidak ditemukan");
    }

    if (user.role !== "ADMIN") {
      set.status = 403;
      throw new Error("Forbidden: akses khusus admin");
    }

    return {
      adminUser: user,
    };
  });