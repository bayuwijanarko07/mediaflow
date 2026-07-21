import { describe, expect, test, afterEach } from "bun:test";
import { redis } from "../../lib/redis";
import { getStoragePath, pathExists, deleteDirectory } from "@mediaflow/storage";
import {
  initUploadSession,
  receiveChunk,
  UploadSessionNotFoundError,
  InvalidChunkIndexError,
} from "./upload.service";

describe("receiveChunk", () => {
  let createdUploadId: string | null = null;

  afterEach(async () => {
    if (createdUploadId) {
      await redis.del(`upload-session:${createdUploadId}`);
      await deleteDirectory(getStoragePath("uploads-temp", createdUploadId));
      createdUploadId = null;
    }
  });

  test("chunk tersimpan di disk dan progress ter-update", async () => {
    const session = await initUploadSession({
      fileName: "test.mp4",
      fileSizeBytes: 10 * 1024 * 1024, // 10MB -> 2 chunk @ 5MB
      title: "Test",
      uploadedById: "user-1",
    });
    createdUploadId = session.uploadId;

    const chunkData = new TextEncoder().encode("fake chunk data").buffer;

    const result = await receiveChunk({
      uploadId: session.uploadId,
      chunkIndex: 0,
      chunkData,
    });

    expect(result.receivedCount).toBe(1);
    expect(result.totalChunks).toBe(2);

    const chunkPath = getStoragePath("uploads-temp", session.uploadId, "chunk-0");
    expect(pathExists(chunkPath)).toBe(true);
  });

  test("kirim chunk yang sama dua kali tidak menambah receivedCount", async () => {
    const session = await initUploadSession({
      fileName: "test.mp4",
      fileSizeBytes: 10 * 1024 * 1024,
      title: "Test",
      uploadedById: "user-1",
    });
    createdUploadId = session.uploadId;

    const chunkData = new TextEncoder().encode("data").buffer;

    await receiveChunk({ uploadId: session.uploadId, chunkIndex: 0, chunkData });
    const result = await receiveChunk({
      uploadId: session.uploadId,
      chunkIndex: 0,
      chunkData,
    });

    expect(result.receivedCount).toBe(1); // tetap 1, bukan 2
  });

  test("throw UploadSessionNotFoundError untuk uploadId tidak valid", async () => {
    let didThrow = false;
    try {
      await receiveChunk({
        uploadId: "tidak-ada",
        chunkIndex: 0,
        chunkData: new ArrayBuffer(10),
      });
    } catch (error) {
      didThrow = true;
      expect(error).toBeInstanceOf(UploadSessionNotFoundError);
    }
    expect(didThrow).toBe(true);
  });

  test("throw InvalidChunkIndexError untuk index di luar rentang", async () => {
    const session = await initUploadSession({
      fileName: "test.mp4",
      fileSizeBytes: 10 * 1024 * 1024, // 2 chunk (index 0-1)
      title: "Test",
      uploadedById: "user-1",
    });
    createdUploadId = session.uploadId;

    let didThrow = false;
    try {
      await receiveChunk({
        uploadId: session.uploadId,
        chunkIndex: 99,
        chunkData: new ArrayBuffer(10),
      });
    } catch (error) {
      didThrow = true;
      expect(error).toBeInstanceOf(InvalidChunkIndexError);
    }
    expect(didThrow).toBe(true);
  });

  test("progress mencapai 100% setelah semua chunk diterima", async () => {
    const session = await initUploadSession({
      fileName: "test.mp4",
      fileSizeBytes: 12 * 1024 * 1024, // 3 chunk
      title: "Test",
      uploadedById: "user-1",
    });
    createdUploadId = session.uploadId;

    const chunkData = new TextEncoder().encode("x").buffer;

    await receiveChunk({ uploadId: session.uploadId, chunkIndex: 0, chunkData });
    await receiveChunk({ uploadId: session.uploadId, chunkIndex: 1, chunkData });
    const finalResult = await receiveChunk({
      uploadId: session.uploadId,
      chunkIndex: 2,
      chunkData,
    });

    expect(finalResult.receivedCount).toBe(3);
    expect(finalResult.totalChunks).toBe(3);
  });
});