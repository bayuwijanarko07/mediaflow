import { describe, expect, test, afterEach } from "bun:test";
import { redis } from "../../lib/redis";
import { getStoragePath, deleteDirectory } from "@mediaflow/storage";
import { initUploadSession, receiveChunk, getReceivedChunkCount } from "./upload.service";

describe("receiveChunk - concurrent uploads (regression test race condition)", () => {
  let createdUploadId: string | null = null;

  afterEach(async () => {
    if (createdUploadId) {
      await redis.del(`upload-session:${createdUploadId}`);
      await redis.del(`upload-session:${createdUploadId}:received-chunks`);
      await deleteDirectory(getStoragePath("uploads-temp", createdUploadId));
      createdUploadId = null;
    }
  });

  test("semua chunk tercatat meski dikirim PARALEL bersamaan (bukan sekuensial)", async () => {
    const CHUNK_SIZE = 5 * 1024 * 1024;
    const totalChunksTarget = 11;

    const session = await initUploadSession({
      fileName: "concurrent-test.mp4",
      fileSizeBytes: CHUNK_SIZE * totalChunksTarget,
      title: "Concurrent Test",
      uploadedById: "user-1",
    });
    createdUploadId = session.uploadId;

    const chunkData = new TextEncoder().encode("x").buffer;

    // Kirim SEMUA 11 chunk BERSAMAAN lewat Promise.all — ini yang dulu
    // menyebabkan race condition dengan pola read-modify-write JSON lama
    await Promise.all(
      Array.from({ length: totalChunksTarget }, (_, i) =>
        receiveChunk({ uploadId: session.uploadId, chunkIndex: i, chunkData })
      )
    );

    const finalCount = await getReceivedChunkCount(session.uploadId);

    // Sebelum fix: ini akan gagal (hasilnya < 11 karena lost update)
    expect(finalCount).toBe(totalChunksTarget);
  });
});