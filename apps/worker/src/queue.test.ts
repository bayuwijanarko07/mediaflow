import { describe, expect, test, afterAll } from "bun:test";
import { Queue, Worker } from "bullmq";
import { createQueueConnection, TRANSCODE_QUEUE_NAME } from "@mediaflow/queue";
import type { TranscodeJobData } from "@mediaflow/queue";

describe("BullMQ transcode queue", () => {
  const testQueue = new Queue<TranscodeJobData>(TRANSCODE_QUEUE_NAME, {
    connection: createQueueConnection(),
  });

  afterAll(async () => {
    await testQueue.close();
  });

  test("job berhasil di-push dan diterima worker", async () => {
    const worker = new Worker<TranscodeJobData>(
      TRANSCODE_QUEUE_NAME,
      async (job) => {
        expect(job.data.videoId).toBe("test-id-123");
        return { processed: true };
      },
      { connection: createQueueConnection() }
    );

    const job = await testQueue.add("test-job", {
      videoId: "test-id-123",
      rawFilePath: "/fake/path.mp4",
    });

    expect(job.id).toBeDefined();

    // Tunggu job selesai diproses (polling sederhana)
    await new Promise<void>((resolve) => {
      worker.on("completed", () => resolve());
    });

    await worker.close();
  }, 10000); // timeout 10 detik, cukup untuk proses async job
});