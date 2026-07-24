import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { prisma } from "@mediaflow/database";
import { authController } from "../auth/auth.controller";
import { videoController } from "./video.controller";
import { getStoragePath, saveFile, deleteDirectory } from "@mediaflow/storage";

const authApp = authController;
const videoApp = videoController;

const userEmail = `playback-test-${Date.now()}@mediaflow.dev`;
const testPassword = "SuperSecret123!";

describe("GET /videos/:id/playback", () => {
  let accessToken: string;
  let readyVideoId: string;
  let notReadyVideoId: string;

  beforeAll(async () => {
    await authApp.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail, password: testPassword }),
      })
    );
    const login = await authApp.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail, password: testPassword }),
      })
    );
    accessToken = (await login.json()).accessToken;

    const user = await prisma.user.findUnique({ where: { email: userEmail } });

    const readyVideo = await prisma.video.create({
      data: { title: "Playback Test Video", uploadedById: user!.id, status: "READY", viewCount: 0 },
    });
    readyVideoId = readyVideo.id;

    // Buat file HLS dummy untuk test serve file
    await saveFile(
      getStoragePath("hls", readyVideoId, "master.m3u8"),
      new TextEncoder().encode("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\n720p/playlist.m3u8\n")
    );
    await saveFile(
      getStoragePath("hls", readyVideoId, "720p", "playlist.m3u8"),
      new TextEncoder().encode("#EXTM3U\nsegment_000.ts\n")
    );
    await saveFile(
      getStoragePath("hls", readyVideoId, "720p", "segment_000.ts"),
      new TextEncoder().encode("dummy ts content")
    );

    const notReadyVideo = await prisma.video.create({
      data: { title: "Not Ready Video", uploadedById: user!.id, status: "PROCESSING" },
    });
    notReadyVideoId = notReadyVideo.id;
  });

  afterAll(async () => {
    await deleteDirectory(getStoragePath("hls", readyVideoId));
    await prisma.video.deleteMany({ where: { id: { in: [readyVideoId, notReadyVideoId] } } });
    await prisma.refreshToken.deleteMany({ where: { user: { email: userEmail } } });
    await prisma.user.deleteMany({ where: { email: userEmail } });
    await prisma.$disconnect();
  });

  test("return 401 tanpa login", async () => {
    const response = await videoApp.handle(
      new Request(`http://localhost/videos/${readyVideoId}/playback`)
    );
    expect(response.status).toBe(401);
  });

  test("init playback berhasil dan increment viewCount", async () => {
    const before = await prisma.video.findUnique({ where: { id: readyVideoId } });

    const response = await videoApp.handle(
      new Request(`http://localhost/videos/${readyVideoId}/playback`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.masterPlaylistUrl).toBe(`/videos/${readyVideoId}/playback/master.m3u8`);

    const after = await prisma.video.findUnique({ where: { id: readyVideoId } });
    expect(after!.viewCount).toBe(before!.viewCount + 1);
  });

  test("serve master playlist dengan content-type benar", async () => {
    const response = await videoApp.handle(
      new Request(`http://localhost/videos/${readyVideoId}/playback/master.m3u8`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("mpegurl");

    const text = await response.text();
    expect(text).toContain("720p/playlist.m3u8");
  });

  test("serve rendition playlist", async () => {
    const response = await videoApp.handle(
      new Request(`http://localhost/videos/${readyVideoId}/playback/720p/playlist.m3u8`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("segment_000.ts");
  });

  test("serve segment .ts dengan content-type video/mp2t", async () => {
    const response = await videoApp.handle(
      new Request(`http://localhost/videos/${readyVideoId}/playback/720p/segment_000.ts`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/mp2t");
  });

  test("tolak path traversal di parameter rendition", async () => {
    const response = await videoApp.handle(
      new Request(
        `http://localhost/videos/${readyVideoId}/playback/${encodeURIComponent("../../../etc")}/passwd`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
    );

    expect(response.status).toBe(404);
  });

  test("tolak path traversal di parameter filename", async () => {
    const response = await videoApp.handle(
      new Request(
        `http://localhost/videos/${readyVideoId}/playback/720p/${encodeURIComponent("../../secret.ts")}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
    );

    expect(response.status).toBe(404);
  });

  test("video belum READY return 404", async () => {
    const response = await videoApp.handle(
      new Request(`http://localhost/videos/${notReadyVideoId}/playback`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    );

    expect(response.status).toBe(404);
  });
});