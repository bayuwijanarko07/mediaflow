import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { prisma } from "@mediaflow/database";
import { videoController } from "./video.controller";

const videoApp = videoController;

describe("GET /videos/:id & GET /videos/trending", () => {
  let userId: string;
  const createdVideoIds: string[] = [];

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `detail-test-${Date.now()}@mediaflow.dev`, passwordHash: "dummy" },
    });
    userId = user.id;

    const readyVideo = await prisma.video.create({
      data: {
        title: "Video Ready Detail Test",
        description: "Deskripsi lengkap",
        uploadedById: userId,
        status: "READY",
        durationSec: 60,
        viewCount: 10,
      },
    });
    createdVideoIds.push(readyVideo.id);

    const processingVideo = await prisma.video.create({
      data: {
        title: "Video Processing Detail Test",
        uploadedById: userId,
        status: "PROCESSING",
      },
    });
    createdVideoIds.push(processingVideo.id);

    const highViewVideo = await prisma.video.create({
      data: {
        title: "Video Trending Tertinggi",
        uploadedById: userId,
        status: "READY",
        viewCount: 999,
      },
    });
    createdVideoIds.push(highViewVideo.id);

    (globalThis as any).__testReadyVideoId = readyVideo.id;
    (globalThis as any).__testProcessingVideoId = processingVideo.id;
    (globalThis as any).__testHighViewVideoId = highViewVideo.id;
  });

  afterAll(async () => {
    await prisma.video.deleteMany({ where: { id: { in: createdVideoIds } } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  test("GET /videos/:id berhasil untuk video READY", async () => {
    const readyVideoId = (globalThis as any).__testReadyVideoId;

    const response = await videoApp.handle(
      new Request(`http://localhost/videos/${readyVideoId}`)
    );

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.video.title).toBe("Video Ready Detail Test");
    expect(data.video.description).toBe("Deskripsi lengkap");
  });

  test("GET /videos/:id return 404 untuk video PROCESSING (belum publik)", async () => {
    const processingVideoId = (globalThis as any).__testProcessingVideoId;

    const response = await videoApp.handle(
      new Request(`http://localhost/videos/${processingVideoId}`)
    );

    expect(response.status).toBe(404);
  });

  test("GET /videos/:id return 404 untuk id tidak ada", async () => {
    const response = await videoApp.handle(
      new Request("http://localhost/videos/id-ngasal")
    );

    expect(response.status).toBe(404);
  });

  test("GET /videos/trending TIDAK ke-capture oleh route /:id", async () => {
    const response = await videoApp.handle(
      new Request("http://localhost/videos/trending")
    );

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(Array.isArray(data.videos)).toBe(true);
  });

  test("GET /videos/trending urut berdasarkan viewCount descending", async () => {
    const response = await videoApp.handle(
      new Request("http://localhost/videos/trending")
    );
    const data = await response.json();

    const highViewVideoId = (globalThis as any).__testHighViewVideoId;
    const topVideo = data.videos[0];

    expect(topVideo.id).toBe(highViewVideoId);
    expect(topVideo.viewCount).toBe(999);
  });

  test("GET /videos/trending menghormati parameter limit", async () => {
    const response = await videoApp.handle(
      new Request("http://localhost/videos/trending?limit=1")
    );
    const data = await response.json();

    expect(data.videos.length).toBe(1);
  });
});