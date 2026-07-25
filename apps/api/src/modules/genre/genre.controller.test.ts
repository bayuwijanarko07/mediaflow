import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { prisma } from "@mediaflow/database";
import { authController } from "../auth/auth.controller";
import { genreController } from "./genre.controller";

const authApp = authController;
const genreApp = genreController;

const adminEmail = `genre-admin-${Date.now()}@mediaflow.dev`;
const regularEmail = `genre-user-${Date.now()}@mediaflow.dev`;
const testPassword = "SuperSecret123!";

describe("GET/POST /genres", () => {
  let adminToken: string;
  let regularToken: string;
  const createdGenreIds: string[] = [];

  beforeAll(async () => {
    await authApp.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmail, password: testPassword }),
      })
    );
    await prisma.user.update({ where: { email: adminEmail }, data: { role: "ADMIN" } });
    const adminLogin = await authApp.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmail, password: testPassword }),
      })
    );
    adminToken = (await adminLogin.json()).accessToken;

    await authApp.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: regularEmail, password: testPassword }),
      })
    );
    const regularLogin = await authApp.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: regularEmail, password: testPassword }),
      })
    );
    regularToken = (await regularLogin.json()).accessToken;
  });

  afterAll(async () => {
    await prisma.genre.deleteMany({ where: { id: { in: createdGenreIds } } });
    await prisma.refreshToken.deleteMany({
      where: { user: { email: { in: [adminEmail, regularEmail] } } },
    });
    await prisma.user.deleteMany({ where: { email: { in: [adminEmail, regularEmail] } } });
    await prisma.$disconnect();
  });

  test("GET /genres bisa diakses tanpa login", async () => {
    const response = await genreApp.handle(new Request("http://localhost/genres"));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.genres)).toBe(true);
  });

  test("POST /genres berhasil untuk admin", async () => {
    const name = `Genre Baru ${Date.now()}`;
    const response = await genreApp.handle(
      new Request("http://localhost/genres", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ name }),
      })
    );

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.genre.name).toBe(name);
    createdGenreIds.push(data.genre.id);
  });

  test("POST /genres ditolak untuk user biasa (403)", async () => {
    const response = await genreApp.handle(
      new Request("http://localhost/genres", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${regularToken}`,
        },
        body: JSON.stringify({ name: "Genre Ditolak" }),
      })
    );

    expect(response.status).toBe(403);
  });

  test("POST /genres dengan nama duplikat return 409", async () => {
    const name = `Genre Duplikat ${Date.now()}`;
    const first = await genreApp.handle(
      new Request("http://localhost/genres", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ name }),
      })
    );
    const firstData = await first.json();
    createdGenreIds.push(firstData.genre.id);

    const second = await genreApp.handle(
      new Request("http://localhost/genres", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ name }),
      })
    );

    expect(second.status).toBe(409);
  });

  test("POST /genres dengan nama kosong return 422", async () => {
    const response = await genreApp.handle(
      new Request("http://localhost/genres", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ name: "" }),
      })
    );

    expect(response.status).toBe(422);
  });
});