import { describe, expect, test, afterEach } from "bun:test";
import { prisma } from "../src/index";

describe("Streaming module schema", () => {
  let createdVideoId: string | null = null;
  let createdUserId: string | null = null;
  let createdGenreId: string | null = null;

  afterEach(async () => {
    if (createdVideoId) {
      await prisma.video.delete({ where: { id: createdVideoId } }).catch(() => {});
      createdVideoId = null;
    }
    if (createdGenreId) {
      await prisma.genre.delete({ where: { id: createdGenreId } }).catch(() => {});
      createdGenreId = null;
    }
    if (createdUserId) {
      await prisma.user.delete({ where: { id: createdUserId } }).catch(() => {});
      createdUserId = null;
    }
  });

  test("bisa membuat Video terkait User", async () => {
    const user = await prisma.user.create({
      data: {
        email: `schema-test-${Date.now()}@mediaflow.dev`,
        passwordHash: "dummy-hash",
      },
    });
    createdUserId = user.id;

    const video = await prisma.video.create({
      data: {
        title: "Test Video",
        uploadedById: user.id,
        status: "UPLOADING",
      },
    });
    createdVideoId = video.id;

    expect(video.title).toBe("Test Video");
    expect(video.status).toBe("UPLOADING");
    expect(video.viewCount).toBe(0);
  });

  test("menghapus Video otomatis menghapus VideoRendition terkait (cascade)", async () => {
    const user = await prisma.user.create({
      data: {
        email: `schema-test-cascade-${Date.now()}@mediaflow.dev`,
        passwordHash: "dummy-hash",
      },
    });
    createdUserId = user.id;

    const video = await prisma.video.create({
      data: { title: "Video Cascade Test", uploadedById: user.id },
    });

    await prisma.videoRendition.create({
      data: {
        videoId: video.id,
        resolution: "720p",
        bitrateKbps: 2800,
        playlistUrl: "/fake/720p.m3u8",
      },
    });

    await prisma.video.delete({ where: { id: video.id } });

    const renditions = await prisma.videoRendition.findMany({
      where: { videoId: video.id },
    });

    expect(renditions.length).toBe(0);
    createdVideoId = null; // sudah dihapus manual di atas
  });

  test("VideoGenre many-to-many relation bekerja", async () => {
    const user = await prisma.user.create({
      data: {
        email: `schema-test-genre-${Date.now()}@mediaflow.dev`,
        passwordHash: "dummy-hash",
      },
    });
    createdUserId = user.id;

    const genre = await prisma.genre.create({
      data: { name: `Test Genre ${Date.now()}` },
    });
    createdGenreId = genre.id;

    const video = await prisma.video.create({
      data: {
        title: "Video dengan Genre",
        uploadedById: user.id,
        genres: {
          create: { genreId: genre.id },
        },
      },
      include: { genres: { include: { genre: true } } },
    });
    createdVideoId = video.id;

    expect(video.genres.length).toBe(1);
    expect(video.genres[0].genre.name).toBe(genre.name);
  });

  test("WatchHistory unique constraint [userId, videoId] mencegah duplikat", async () => {
    const user = await prisma.user.create({
        data: {
        email: `schema-test-watch-${Date.now()}@mediaflow.dev`,
        passwordHash: "dummy-hash",
        },
    });
    createdUserId = user.id;

    const video = await prisma.video.create({
        data: { title: "Video Watch Test", uploadedById: user.id },
    });
    createdVideoId = video.id;

    await prisma.watchHistory.create({
        data: { userId: user.id, videoId: video.id, progressSec: 30 },
    });

    // Percobaan create kedua dengan userId+videoId sama harus gagal (unique constraint)
    let didThrow = false;
    try {
        await prisma.watchHistory.create({
        data: { userId: user.id, videoId: video.id, progressSec: 60 },
        });
    } catch {
        didThrow = true;
    }

    expect(didThrow).toBe(true);
    });
});