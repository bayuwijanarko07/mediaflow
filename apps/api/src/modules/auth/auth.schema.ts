import { t } from "elysia";

export const registerBodySchema = t.Object({
  email: t.String({
    format: "email",
    error: "Format email tidak valid",
  }),
  password: t.String({
    minLength: 8,
    error: "Password minimal 8 karakter",
  }),
  name: t.Optional(t.String({ minLength: 1 })),
});

export type RegisterBody = typeof registerBodySchema.static;