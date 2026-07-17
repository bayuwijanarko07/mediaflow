import { Elysia } from "elysia";
import { registerBodySchema } from "./auth.schema";
import { registerUser, EmailAlreadyExistsError } from "./auth.service";

export const authController = new Elysia({ prefix: "/auth" }).post(
  "/register",
  async ({ body, set }) => {
    try {
      const user = await registerUser(body);
      set.status = 201;
      return { user };
    } catch (error) {
      if (error instanceof EmailAlreadyExistsError) {
        set.status = 409;
        return { message: error.message };
      }

      set.status = 500;
      return { message: "Terjadi kesalahan pada server" };
    }
  },
  {
    body: registerBodySchema,
  }
);