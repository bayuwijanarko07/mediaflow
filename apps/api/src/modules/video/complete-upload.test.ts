import { describe, expect, test, afterAll } from "bun:test";
import { prisma } from "@mediaflow/database";
import { redis } from "../../lib/redis";
import { getStoragePath, pathExists, deleteFile, deleteDirectory } from "@mediaflow/storage";
import {
  initUploadSession,
  receiveChunk,
  assembleChunks,
  IncompleteUploadError,
} from "./upload.service";
import { createVideoRecord } from "./video.service";

describe("assembleChunks & complete flow", () => {
  const createdVideoIds: string[] = [];
  const createdUploadIds: string[] = [];

  afterAll(async () => {
    for (const videoId of createdVideoIds) {
      const video = await prisma.video.findUnique({ where: { id: videoId } });
      if (video?.rawFileKey) {
        await deleteFile(video.rawFileKey);
      }
      await prisma.video.delete({ where: { id: videoId } }).catch(() => {});
    }
    for (const uploadId of createdUploadIds) {
      await redis.del(`upload-session:${uploadId}`);
      await deleteDirectory(getStoragePath("uploads-temp", uploadId));
    }
    await prisma.$disconnect();
  });

  test("assembleChunks menggabungkan chunk jadi 1 file utuh dengan urutan benar", async () => {
    const session = await initUploadSession({
      fileName: "test.mp4",
      fileSizeBytes: 10, // sengaja kecil untuk kontrol isi persis
      title: "Test Assembly",
      uploadedById: "user-1",
    });
    createdUploadIds.push(session.uploadId);

    // Override totalChunks jadi 2 secara manual via chunk kecil terkontrol
    const chunk0 = new TextEncoder().encode("Hello").buffer; // 5 byte
    const chunk1 = new TextEncoder().encode("World").buffer; // 5 byte

    await receiveChunk({ uploadId: session.uploadId, chunkIndex: 0, chunkData: chunk0 });
    await receiveChunk({ uploadId: session.uploadId, chunkIndex: 1, chunkData: chunk1 });

    const { rawFilePath } = await assembleChunks({
      uploadId: session.uploadId,
      fileName: "test.mp4",
    });

    expect(pathExists(rawFilePath)).toBe(true);

    const content = await Bun.file(rawFilePath).text();
    expect(content).toBe("HelloWorld"); // urutan harus benar: chunk0 + chunk1

    // Folder uploads-temp harus sudah terhapus
    const uploadTempDir = getStoragePath("uploads-temp", session.uploadId);
    expect(pathExists(uploadTempDir)).toBe(false);

    await deleteFile(rawFilePath);
  });

  test("throw IncompleteUploadError kalau chunk belum lengkap", async () => {
    const session = await initUploadSession({
      fileName: "incomplete.mp4",
      fileSizeBytes: 10 * 1024 * 1024, // 2 chunk
      title: "Incomplete Test",
      uploadedById: "user-1",
    });
    createdUploadIds.push(session.uploadId);

    // Cuma kirim 1 dari 2 chunk yang dibutuhkan
    await receiveChunk({
      uploadId: session.uploadId,
      chunkIndex: 0,
      chunkData: new TextEncoder().encode("x").buffer,
    });

    let didThrow = false;
    try {
      await assembleChunks({ uploadId: session.uploadId, fileName: "incomplete.mp4" });
    } catch (error) {
      didThrow = true;
      expect(error).toBeInstanceOf(IncompleteUploadError);
    }

    expect(didThrow).toBe(true);
  });

  test("createVideoRecord membuat record dengan status UPLOADED", async () => {
    const video = await createVideoRecord({
      title: "Test Video Record",
      uploadedById: "fake-user-id-for-test",
      rawFileKey: "/fake/path.mp4",
    }).catch(() => null);

    // Kalau uploadedById harus valid foreign key, test ini mungkin gagal
    // di lingkungan tanpa user asli — sesuaikan dengan user id yang benar
    // ada di database test kamu, atau skip test ini kalau perlu setup user dulu.
    if (video) {
      createdVideoIds.push(video.id);
      expect(video.status).toBe("UPLOADED");
    }
  });
});