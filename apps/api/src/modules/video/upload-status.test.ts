import { describe, expect, test, afterEach } from "bun:test";
import { redis } from "../../lib/redis";
import { getStoragePath, deleteDirectory } from "@mediaflow/storage";
import {
  initUploadSession,
  receiveChunk,
  getUploadStatus,
  UploadSessionNotFoundError,
} from "./upload.service";

describe("getUploadStatus", () => {
  let createdUploadId: string | null = null;

  afterEach(async () => {
    if (createdUploadId) {
      await redis.del(`upload-session:${createdUploadId}`);
      await deleteDirectory(getStoragePath("uploads-temp", createdUploadId));
      createdUploadId = null;
    }
  });

  test("status awal menunjukkan receivedChunks kosong, isComplete false", async () => {
    const session = await initUploadSession({
      fileName: "test.mp4",
      fileSizeBytes: 10 * 1024 * 1024,
      title: "Test",
      uploadedById: "user-1",
    });
    createdUploadId = session.uploadId;

    const status = await getUploadStatus(session.uploadId);

    expect(status.totalChunks).toBe(2);
    expect(status.receivedChunks).toEqual([]);
    expect(status.isComplete).toBe(false);
  });

  test("status mencerminkan chunk yang sudah diterima secara akurat, termasuk yang skip (simulasi resume)", async () => {
    const session = await initUploadSession({
      fileName: "test.mp4",
      fileSizeBytes: 15 * 1024 * 1024, // 3 chunk
      title: "Test",
      uploadedById: "user-1",
    });
    createdUploadId = session.uploadId;

    const chunkData = new TextEncoder().encode("x").buffer;

    // Kirim chunk 0 dan 2, SKIP chunk 1 (simulasi koneksi putus)
    await receiveChunk({ uploadId: session.uploadId, chunkIndex: 0, chunkData });
    await receiveChunk({ uploadId: session.uploadId, chunkIndex: 2, chunkData });

    const status = await getUploadStatus(session.uploadId);

    expect(status.receivedChunks).toEqual([0, 2]);
    expect(status.isComplete).toBe(false);
  });

  test("isComplete true setelah semua chunk diterima", async () => {
    const session = await initUploadSession({
      fileName: "test.mp4",
      fileSizeBytes: 10 * 1024 * 1024, // 2 chunk
      title: "Test",
      uploadedById: "user-1",
    });
    createdUploadId = session.uploadId;

    const chunkData = new TextEncoder().encode("x").buffer;

    await receiveChunk({ uploadId: session.uploadId, chunkIndex: 0, chunkData });
    await receiveChunk({ uploadId: session.uploadId, chunkIndex: 1, chunkData });

    const status = await getUploadStatus(session.uploadId);

    expect(status.isComplete).toBe(true);
  });

  test("throw UploadSessionNotFoundError untuk uploadId yang tidak ada", async () => {
    let didThrow = false;
    try {
      await getUploadStatus("upload-id-tidak-ada");
    } catch (error) {
      didThrow = true;
      expect(error).toBeInstanceOf(UploadSessionNotFoundError);
    }
    expect(didThrow).toBe(true);
  });
});