import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { prisma } from "@mediaflow/database";
import { authController } from "../auth/auth.controller";
import { videoController } from "./video.controller";
import { meController } from "../me/me.controller";

const authApp = authController;
const videoApp = videoController;
const meApp = meController;

const userEmail = `watch-progress-${Date.now()}@mediaflow.dev`;
const testPassword = "SuperSecret123!";

describe("POST /videos/:id/watch-progress & GET /me/watch-history", () => {
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
    const loginData = await login.json();
    accessToken = loginData.accessToken;

    const readyVideo = await prisma.video.create({
      data: {
        title: "Watch Progress Test Video",
        uploadedById: loginData.user.id,
        status: "READY",
        durationSec: 100,
      },
    });
    readyVideoId = readyVideo.id;

    const notReadyVideo = await prisma.video.create({
      data: {
        title: "Belum Ready",
        uploadedById: loginData.user.id,
        status: "PROCESSING",
      },
    });
    notReadyVideoId = notReadyVideo.id;
  });

  afterAll(async () => {
    await prisma.watchHistory.deleteMany({ where: { user: { email: userEmail } } });
    await prisma.video.deleteMany({ where: { id: { in: [readyVideoId, notReadyVideoId] } } });
    await prisma.refreshToken.deleteMany({ where: { user: { email: userEmail } } });
    await prisma.user.deleteMany({ where: { email: userEmail } });
    await prisma.$disconnect();
  });

  test("return 401 tanpa login", async () => {
    const response = await videoApp.handle(
      new Request(`http://localhost/videos/${readyVideoId}/watch-progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progressSec: 10 }),
      })
    );
    expect(response.status).toBe(401);
  });

  test("simpan progress berhasil, completed masih false", async () => {
    const response = await videoApp.handle(
      new Request(`http://localhost/videos/${readyVideoId}/watch-progress`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ progressSec: 30 }),
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.progressSec).toBe(30);
    expect(data.completed).toBe(false);
  });

  test("progress >= 95% durasi otomatis completed true", async () => {
    const response = await videoApp.handle(
      new Request(`http://localhost/videos/${readyVideoId}/watch-progress`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ progressSec: 96 }), // durationSec = 100
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.completed).toBe(true);
  });

  test("upsert: kirim progress kedua kali untuk video sama tidak membuat duplikat row", async () => {
    await videoApp.handle(
      new Request(`http://localhost/videos/${readyVideoId}/watch-progress`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ progressSec: 50 }),
      })
    );

    const count = await prisma.watchHistory.count({
      where: { videoId: readyVideoId },
    });
    expect(count).toBe(1);
  });

  test("video belum READY return 404", async () => {
    const response = await videoApp.handle(
      new Request(`http://localhost/videos/${notReadyVideoId}/watch-progress`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ progressSec: 5 }),
      })
    );

    expect(response.status).toBe(404);
  });

  test("GET /me/watch-history return 401 tanpa login", async () => {
    const response = await meApp.handle(
      new Request("http://localhost/me/watch-history")
    );
    expect(response.status).toBe(401);
  });

  test("GET /me/watch-history return riwayat urut lastWatchedAt terbaru", async () => {
    const response = await meApp.handle(
      new Request("http://localhost/me/watch-history", {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.history)).toBe(true);

    const entry = data.history.find((h: any) => h.videoId === readyVideoId);
    expect(entry).toBeDefined();
    expect(entry.progressSec).toBe(50);
    expect(entry.title).toBe("Watch Progress Test Video");
  });

  test("watch history tidak menampilkan video yang statusnya bukan READY", async () => {
    // paksa insert history untuk video not-ready langsung ke DB
    // (skip lewat endpoint karena endpoint sudah menolak video non-READY)
    const user = await prisma.user.findUnique({ where: { email: userEmail } });
    await prisma.watchHistory.create({
      data: { userId: user!.id, videoId: notReadyVideoId, progressSec: 5 },
    });

    const response = await meApp.handle(
      new Request("http://localhost/me/watch-history", {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    );

    const data = await response.json();
    const titles = data.history.map((h: any) => h.title);
    expect(titles).not.toContain("Belum Ready");
  });
});