import { Elysia } from "elysia";
import { jwtPlugin } from "../../plugins/jwt.plugin";
import { registerBodySchema, loginBodySchema } from "./auth.schema";
import { REFRESH_TOKEN_COOKIE_NAME } from "./auth.constants";
import { authRateLimitPlugin } from "../../plugins/rate-limit.plugin";
import {
    registerUser,
    findUserByEmail,
    verifyPassword,
    createRefreshToken,
    rotateRefreshToken,
    revokeRefreshToken,
    getRefreshTokenMaxAgeSeconds,
    EmailAlreadyExistsError,
    InvalidCredentialsError,
    getUserById,
    InvalidRefreshTokenError,
    revokeAllUserRefreshTokens,
} from "./auth.service";
import { requireAuth } from "../../middleware/auth.middleware";

export const authController = new Elysia({ prefix: "/auth" })
    .use(jwtPlugin)
    .group("", (app) =>
        app
        .use(authRateLimitPlugin)
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
    )
    .post(
    "/refresh", 
    async ({ jwt, cookie, set }) => {
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
    })
    .post(
        "/logout", 
        async ({ cookie, set }) => {
        const refreshTokenCookie = cookie[REFRESH_TOKEN_COOKIE_NAME];
        const token = refreshTokenCookie.value;

        if (token) {
            await revokeRefreshToken(token);
        }

        refreshTokenCookie.remove();

        set.status = 200;
        return { message: "Logout berhasil" };
    })
    .use(requireAuth)
    .get("/me", async ({ userId, set }) => {
        const user = await getUserById(userId);

        if (!user) {
        set.status = 404;
        return { message: "User tidak ditemukan" };
        }

        return { user };
    })
    .post("/logout-all", async ({ userId, cookie }) => {
        await revokeAllUserRefreshTokens(userId);

        cookie[REFRESH_TOKEN_COOKIE_NAME].remove();

        return { message: "Berhasil logout dari semua device" };
    });