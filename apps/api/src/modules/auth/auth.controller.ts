import { Elysia } from "elysia";
import { jwtPlugin } from "../../plugins/jwt.plugin";
import { registerBodySchema, loginBodySchema } from "./auth.schema";
import {
  registerUser,
  findUserByEmail,
  verifyPassword,
  createRefreshToken,
  getRefreshTokenMaxAgeSeconds,
  EmailAlreadyExistsError,
  InvalidCredentialsError,
} from "./auth.service";

export const authController = new Elysia({ prefix: "/auth" })
    .use(jwtPlugin)
    .post(
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
    { body: registerBodySchema }
)
    .post(
    "/login",
    async ({ body, jwt, cookie, set }) => {
      const user = await findUserByEmail(body.email);

      if (!user) {
        set.status = 401;
        return { message: "Email atau password salah" };
      }

      const isPasswordValid = await verifyPassword(
        body.password,
        user.passwordHash
      );

      if (!isPasswordValid) {
        set.status = 401;
        return { message: "Email atau password salah" };
      }

      const accessToken = await jwt.sign({ sub: user.id });
      const { token: refreshToken } = await createRefreshToken(user.id);

      cookie.refresh_token.set({
        value: refreshToken,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: getRefreshTokenMaxAgeSeconds(),
      });

      return {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          isVerified: user.isVerified,
        },
      };
    },
    { body: loginBodySchema }
  );