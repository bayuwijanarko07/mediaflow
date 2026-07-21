import { Elysia } from "elysia";
import { jwtPlugin } from "../../plugins/jwt.plugin";
import { getUserById } from "../../modules/auth/auth.service";

export const requireAdmin = new Elysia()
  .use(jwtPlugin)
  .derive({ as: "scoped" }, async ({ jwt, headers, set }) => {
    const authHeader = headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      set.status = 401;
      throw new Error("Unauthorized: token tidak ditemukan");
    }

    const token = authHeader.slice("Bearer ".length);
    const payload = await jwt.verify(token);

    if (!payload) {
      set.status = 401;
      throw new Error("Unauthorized: token tidak valid");
    }

    const userId = payload.sub as string;
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