import { Elysia } from "elysia";
import { jwtPlugin } from "../plugins/jwt.plugin";

export const requireAuth = new Elysia()
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
      throw new Error("Unauthorized: token tidak valid atau kedaluwarsa");
    }

    return {
      userId: payload.sub as string,
    };
  });