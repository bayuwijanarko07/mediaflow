import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { prisma } from "@mediaflow/database";
import { authController } from "../auth/auth.controller";
import { videoController } from "./video.controller";

const authApp = authController;
const videoApp = videoController;

const adminEmail = `admin-list-${Date.now()}@mediaflow.dev`;
const regularEmail = `user-list-${Date.now()}@mediaflow.dev`;
const testPassword = "SuperSecret123!";

describe("GET /videos/admin (list semua video)", () => {
  let adminToken: string;
  let regularToken: string;
  let userId: string;
  const createdVideoIds: string[] = [];

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
    userId = adminData.user.id;

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

    const readyVideo = await prisma.video.create({
      data: { title: "Admin List Ready", uploadedById: userId, status: "READY" },
    });
    createdVideoIds.push(readyVideo.id);

    const processingVideo = await prisma.video.create({
      data: { title: "Admin List Processing", uploadedById: userId, status: "PROCESSING" },
    });
    createdVideoIds.push(processingVideo.id);
    await prisma.transcodeJob.create({
      data: { videoId: processingVideo.id, status: "RUNNING", progress: 42 },
    });

    const failedVideo = await prisma.video.create({
      data: { title: "Admin List Failed", uploadedById: userId, status: "FAILED" },
    });
    createdVideoIds.push(failedVideo.id);
    await prisma.transcodeJob.create({
      data: {
        videoId: failedVideo.id,
        status: "FAILED",
        errorMessage: "Simulasi gagal",
        completedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await prisma.transcodeJob.deleteMany({ where: { videoId: { in: createdVideoIds } } });
    await prisma.video.deleteMany({ where: { id: { in: createdVideoIds } } });
    await prisma.refreshToken.deleteMany({
      where: { user: { email: { in: [adminEmail, regularEmail] } } },
    });
    await prisma.user.deleteMany({ where: { email: { in: [adminEmail, regularEmail] } } });
    await prisma.$disconnect();
  });

  test("return 401 tanpa login", async () => {
    const response = await videoApp.handle(new Request("http://localhost/videos/admin"));
    expect(response.status).toBe(401);
  });

  test("return 403 untuk user biasa", async () => {
    const response = await videoApp.handle(
      new Request("http://localhost/videos/admin", {
        headers: { Authorization: `Bearer ${regularToken}` },
      })
    );
    expect(response.status).toBe(403);
  });

  test("admin bisa lihat video di SEMUA status, termasuk non-READY", async () => {
    const response = await videoApp.handle(
      new Request("http://localhost/videos/admin", {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    const titles = data.videos.map((v: any) => v.title);

    expect(titles).toContain("Admin List Ready");
    expect(titles).toContain("Admin List Processing");
    expect(titles).toContain("Admin List Failed");
  });

  test("latestJob menyertakan progress & errorMessage dari job terbaru", async () => {
    const response = await videoApp.handle(
      new Request("http://localhost/videos/admin", {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    );
    const data = await response.json();

    const processing = data.videos.find((v: any) => v.title === "Admin List Processing");
    expect(processing.latestJob.status).toBe("RUNNING");
    expect(processing.latestJob.progress).toBe(42);

    const failed = data.videos.find((v: any) => v.title === "Admin List Failed");
    expect(failed.latestJob.status).toBe("FAILED");
    expect(failed.latestJob.errorMessage).toBe("Simulasi gagal");
  });

  test("filter status=FAILED hanya mengembalikan video FAILED", async () => {
    const response = await videoApp.handle(
      new Request("http://localhost/videos/admin?status=FAILED", {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    );
    const data = await response.json();

    expect(data.videos.every((v: any) => v.status === "FAILED")).toBe(true);
    expect(data.videos.some((v: any) => v.title === "Admin List Failed")).toBe(true);
  });

  test("status query tidak valid ditolak validasi (422)", async () => {
    const response = await videoApp.handle(
      new Request("http://localhost/videos/admin?status=NGACO", {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
    );

    expect(response.status).toBe(422);
  });
});