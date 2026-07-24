import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { prisma } from "@mediaflow/database";
import { videoController } from "./video.controller";

const videoApp = videoController;

describe("GET /videos (catalog)", () => {
  let userId: string;
  let genreActionId: string;
  let genreComedyId: string;
  const createdVideoIds: string[] = [];

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `catalog-test-${Date.now()}@mediaflow.dev`,
        passwordHash: "dummy",
      },
    });
    userId = user.id;

    const genreAction = await prisma.genre.create({
      data: { name: `Action-${Date.now()}` },
    });
    genreActionId = genreAction.id;

    const genreComedy = await prisma.genre.create({
      data: { name: `Comedy-${Date.now()}` },
    });
    genreComedyId = genreComedy.id;

    // Video READY dengan genre Action
    const video1 = await prisma.video.create({
      data: {
        title: "Aksi Seru Test",
        uploadedById: userId,
        status: "READY",
        durationSec: 120,
        genres: { create: { genreId: genreActionId } },
      },
    });
    createdVideoIds.push(video1.id);

    // Video READY dengan genre Comedy
    const video2 = await prisma.video.create({
      data: {
        title: "Komedi Lucu Test",
        uploadedById: userId,
        status: "READY",
        durationSec: 90,
        genres: { create: { genreId: genreComedyId } },
      },
    });
    createdVideoIds.push(video2.id);

    // Video BELUM READY — TIDAK BOLEH muncul di katalog
    const video3 = await prisma.video.create({
      data: {
        title: "Video Sedang Diproses",
        uploadedById: userId,
        status: "PROCESSING",
      },
    });
    createdVideoIds.push(video3.id);
  });

  afterAll(async () => {
    await prisma.videoGenre.deleteMany({ where: { videoId: { in: createdVideoIds } } });
    await prisma.video.deleteMany({ where: { id: { in: createdVideoIds } } });
    await prisma.genre.deleteMany({ where: { id: { in: [genreActionId, genreComedyId] } } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  test("hanya video READY yang muncul di katalog", async () => {
    const response = await videoApp.handle(new Request("http://localhost/videos"));
    const data = await response.json();

    const titles = data.videos.map((v: any) => v.title);
    expect(titles).toContain("Aksi Seru Test");
    expect(titles).toContain("Komedi Lucu Test");
    expect(titles).not.toContain("Video Sedang Diproses");
  });

  test("filter genre bekerja dengan benar", async () => {
    const genreName = (await prisma.genre.findUnique({ where: { id: genreActionId } }))!.name;

    const response = await videoApp.handle(
      new Request(`http://localhost/videos?genre=${encodeURIComponent(genreName)}`)
    );
    const data = await response.json();

    const titles = data.videos.map((v: any) => v.title);
    expect(titles).toContain("Aksi Seru Test");
    expect(titles).not.toContain("Komedi Lucu Test");
  });

  test("search judul bekerja dengan benar (case-insensitive)", async () => {
    const response = await videoApp.handle(
      new Request("http://localhost/videos?search=komedi")
    );
    const data = await response.json();

    const titles = data.videos.map((v: any) => v.title);
    expect(titles).toContain("Komedi Lucu Test");
    expect(titles).not.toContain("Aksi Seru Test");
  });

  test("pagination return metadata yang benar", async () => {
    const response = await videoApp.handle(
      new Request("http://localhost/videos?page=1&limit=1")
    );
    const data = await response.json();

    expect(data.videos.length).toBe(1);
    expect(data.pagination.page).toBe(1);
    expect(data.pagination.limit).toBe(1);
    expect(data.pagination.totalItems).toBeGreaterThanOrEqual(2);
  });

  test("response menyertakan genres sebagai array nama", async () => {
    const response = await videoApp.handle(new Request("http://localhost/videos"));
    const data = await response.json();

    const actionVideo = data.videos.find((v: any) => v.title === "Aksi Seru Test");
    expect(actionVideo.genres.length).toBeGreaterThan(0);
  });
});