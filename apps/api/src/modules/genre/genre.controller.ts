import { t } from "elysia";
import { Elysia } from "elysia";
import { prisma } from "@mediaflow/database";
import { requireAdmin } from "../../modules/auth/admin.middleware";

const createGenreBodySchema = t.Object({
  name: t.String({ minLength: 1, error: "Nama genre wajib diisi" }),
});

export const genreController = new Elysia({ prefix: "/genres" })
  .get("/", async () => {
    const genres = await prisma.genre.findMany({ orderBy: { name: "asc" } });
    return { genres };
  })
  .use(requireAdmin)
  .post("/", async ({ body, set }) => {
    const { name } = body as { name: string };

    const existing = await prisma.genre.findUnique({ where: { name } });
    if (existing) {
      set.status = 409;
      return { message: "Genre sudah ada" };
    }

    const genre = await prisma.genre.create({ data: { name } });
    set.status = 201;
    return { genre };
  }, { body: createGenreBodySchema });