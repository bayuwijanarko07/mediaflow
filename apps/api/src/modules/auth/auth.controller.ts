import { Elysia } from "elysia";
import { jwtPlugin } from "../../plugins/jwt.plugin";
import { registerBodySchema, loginBodySchema } from "./auth.schema";
import { REFRESH_TOKEN_COOKIE_NAME } from "./auth.constants";
import {
    registerUser,
    findUserByEmail,
    verifyPassword,
    createRefreshToken,
    rotateRefreshToken,
    getRefreshTokenMaxAgeSeconds,
    EmailAlreadyExistsError,
    InvalidCredentialsError,
    InvalidRefreshTokenError,
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
)
    .post("/refresh", async ({ jwt, cookie, set }) => {
    const refreshTokenCookie = cookie[REFRESH_TOKEN_COOKIE_NAME];
    const oldToken = refreshTokenCookie.value;

    if (!oldToken) {
      set.status = 401;
      return { message: "Refresh token tidak ditemukan" };
    }

    try {
      const { newRefreshToken, user } = await rotateRefreshToken(oldToken);

      const accessToken = await jwt.sign({ sub: user.id });

      refreshTokenCookie.set({
        value: newRefreshToken,
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
    } catch (error) {
      if (error instanceof InvalidRefreshTokenError) {
        set.status = 401;
        // Hapus cookie yang sudah tidak valid
        refreshTokenCookie.remove();
        return { message: error.message };
      }

      set.status = 500;
      return { message: "Terjadi kesalahan pada server" };
    }
});