import { describe, expect, test, afterEach } from "bun:test";
import { redis } from "../../lib/redis";
import { initUploadSession, getUploadSession, FileTooLargeError } from "./upload.service";

describe("initUploadSession", () => {
  let createdUploadId: string | null = null;

  afterEach(async () => {
    if (createdUploadId) {
      await redis.del(`upload-session:${createdUploadId}`);
      createdUploadId = null;
    }
  });

  test("berhasil membuat sesi upload dengan totalChunks yang benar", async () => {
    const result = await initUploadSession({
      fileName: "test.mp4",
      fileSizeBytes: 52428800, // 50MB
      title: "Test Video",
      uploadedById: "fake-user-id",
    });
    createdUploadId = result.uploadId;

    expect(result.uploadId).toBeDefined();
    expect(result.chunkSize).toBe(5 * 1024 * 1024);
    expect(result.totalChunks).toBe(10);
  });

  test("totalChunks dibulatkan ke atas untuk sisa file yang tidak pas", async () => {
    const result = await initUploadSession({
      fileName: "test.mp4",
      fileSizeBytes: 12 * 1024 * 1024, // 12MB, chunk 5MB -> harus 3 chunk (5+5+2)
      title: "Test Video",
      uploadedById: "fake-user-id",
    });
    createdUploadId = result.uploadId;

    expect(result.totalChunks).toBe(3);
  });

  test("throw FileTooLargeError kalau melebihi MAX_FILE_SIZE_GB", async () => {
    let didThrow = false;
    try {
      await initUploadSession({
        fileName: "huge.mp4",
        fileSizeBytes: 11 * 1024 * 1024 * 1024, // 11GB, limit 10GB
        title: "Huge Video",
        uploadedById: "fake-user-id",
      });
    } catch (error) {
      didThrow = true;
      expect(error).toBeInstanceOf(FileTooLargeError);
    }

    expect(didThrow).toBe(true);
  });

  test("sesi tersimpan di Redis dan bisa dibaca ulang", async () => {
    const result = await initUploadSession({
      fileName: "readback.mp4",
      fileSizeBytes: 10 * 1024 * 1024,
      title: "Readback Test",
      uploadedById: "user-123",
    });
    createdUploadId = result.uploadId;

    const session = await getUploadSession(result.uploadId);

    expect(session).not.toBeNull();
    expect(session?.fileName).toBe("readback.mp4");
    expect(session?.uploadedById).toBe("user-123");
    expect(session?.receivedChunks).toEqual([]);
  });

  test("getUploadSession return null untuk uploadId yang tidak ada", async () => {
    const session = await getUploadSession("upload-id-tidak-ada");
    expect(session).toBeNull();
  });
});