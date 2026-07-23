import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { prisma } from "@mediaflow/database";
import { authController } from "../auth/auth.controller";
import { videoController } from "./video.controller";

const authApp = authController;
const videoApp = videoController;

const adminEmail = `jobs-admin-${Date.now()}@mediaflow.dev`;
const regularEmail = `jobs-user-${Date.now()}@mediaflow.dev`;
const testPassword = "SuperSecret123!";

describe("GET/POST /videos/admin/:id/jobs & retry", () => {
  let adminToken: string;
  let regularToken: string;
  let readyVideoId: string;
  let failedVideoId: string;

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
    const adminData = await adminLogin.json();
    adminToken = adminData.accessToken;

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

    // Buat video dummy READY
    const readyVideo = await prisma.video.create({
      data: { title: "Ready Video", uploadedById: adminData.user.id, status: "READY" },
    });
    readyVideoId = readyVideo.id;
    await prisma.transcodeJob.create({
      data: { videoId: readyVideoId, status: "COMPLETED", progress: 100 },
    });

    // Buat video dummy FAILED (tanpa rawFileKey, untuk test 409)
    const failedVideo = await prisma.video.create({
      data: {
        title: "Failed Video",
        uploadedById: adminData.user.id,
        status: "FAILED",
        rawFileKey: "/path/tidak/ada/file.mp4",
      },
    });
    failedVideoId = failedVideo.id;
    await prisma.transcodeJob.create({
      data: {
        videoId: failedVideoId,
        status: "FAILED",
        errorMessage: "Simulasi error test",
        completedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await prisma.transcodeJob.deleteMany({
      where: { videoId: { in: [readyVideoId, failedVideoId] } },
    });
    await prisma.video.deleteMany({ where: { id: { in: [readyVideoId, failedVideoId] } } });
    await prisma.refreshToken.deleteMany({
      where: { user: { email: { in: [adminEmail, regularEmail] } } },
    });
    await prisma.user.deleteMany({ where: { email: { in: [adminEmail, regularEmail] } } });
    await prisma.$disconnect();
  });

  test("GET jobs berhasil untuk admin, return video + riwayat job", async () => {
    const response = await videoApp.handle(
      new Request(`http://localhost/videos/admin/${readyVideoId}/jobs`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    );

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.video.id).toBe(readyVideoId);
    expect(data.jobs.length).toBe(1);
    expect(data.jobs[0].status).toBe("COMPLETED");
  });

  test("GET jobs ditolak untuk user biasa (403)", async () => {
    const response = await videoApp.handle(
      new Request(`http://localhost/videos/admin/${readyVideoId}/jobs`, {
        headers: { Authorization: `Bearer ${regularToken}` },
      })
    );

    expect(response.status).toBe(403);
  });

  test("GET jobs untuk videoId tidak ada return 404", async () => {
    const response = await videoApp.handle(
      new Request("http://localhost/videos/admin/video-id-ngasal/jobs", {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    );

    expect(response.status).toBe(404);
  });

  test("POST retry ditolak untuk video status READY (400)", async () => {
    const response = await videoApp.handle(
      new Request(`http://localhost/videos/admin/${readyVideoId}/retry`, {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    );

    expect(response.status).toBe(400);
  });

  test("POST retry ditolak kalau raw file sudah tidak ada di disk (409)", async () => {
    const response = await videoApp.handle(
      new Request(`http://localhost/videos/admin/${failedVideoId}/retry`, {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    );

    expect(response.status).toBe(409);
  });
});