import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { prisma } from "@mediaflow/database";
import { redis } from "../../lib/redis";
import { authController } from "../auth/auth.controller";
import { videoController } from "./video.controller";

const authApp = authController;
const videoApp = videoController;

const adminEmail = `video-admin-${Date.now()}@mediaflow.dev`;
const regularEmail = `video-user-${Date.now()}@mediaflow.dev`;
const testPassword = "SuperSecret123!";

describe("POST /videos/upload/init", () => {
  let adminToken: string;
  let regularToken: string;
  let createdUploadId: string | null = null;

  beforeAll(async () => {
    await authApp.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmail, password: testPassword }),
      })
    );
    await prisma.user.update({
      where: { email: adminEmail },
      data: { role: "ADMIN" },
    });
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
    if (createdUploadId) {
      await redis.del(`upload-session:${createdUploadId}`);
    }
    await prisma.refreshToken.deleteMany({
      where: { user: { email: { in: [adminEmail, regularEmail] } } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [adminEmail, regularEmail] } },
    });
    await prisma.$disconnect();
  });

  test("admin berhasil init upload", async () => {
    const response = await videoApp.handle(
      new Request("http://localhost/videos/upload/init", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          fileName: "test.mp4",
          fileSizeBytes: 10 * 1024 * 1024,
          title: "Test Video",
        }),
      })
    );

    expect(response.status).toBe(201);

    const data = await response.json();
    expect(data.uploadId).toBeDefined();
    createdUploadId = data.uploadId;
  });

  test("user biasa ditolak (403)", async () => {
    const response = await videoApp.handle(
      new Request("http://localhost/videos/upload/init", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${regularToken}`,
        },
        body: JSON.stringify({
          fileName: "test.mp4",
          fileSizeBytes: 1000,
          title: "Test",
        }),
      })
    );

    expect(response.status).toBe(403);
  });

  test("tanpa login ditolak (401)", async () => {
    const response = await videoApp.handle(
      new Request("http://localhost/videos/upload/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: "test.mp4",
          fileSizeBytes: 1000,
          title: "Test",
        }),
      })
    );

    expect(response.status).toBe(401);
  });

  test("file melebihi batas maksimal ditolak (413)", async () => {
    const response = await videoApp.handle(
      new Request("http://localhost/videos/upload/init", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          fileName: "huge.mp4",
          fileSizeBytes: 11 * 1024 * 1024 * 1024,
          title: "Huge Video",
        }),
      })
    );

    expect(response.status).toBe(413);
  });
});