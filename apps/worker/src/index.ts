import { Worker } from "bullmq";
import { prisma } from "@mediaflow/database";
import { ensureStorageDirs } from "@mediaflow/storage";
import { createQueueConnection, TRANSCODE_QUEUE_NAME } from "@mediaflow/queue";
import type { TranscodeJobData } from "@mediaflow/queue";
import { processTranscodeJob } from "./jobs/transcode.job";

async function main() {
  console.log("🔧 Mediaflow Worker started");

  await ensureStorageDirs();
  await prisma.$connect();
  console.log("✅ Database & storage siap");

  const worker = new Worker<TranscodeJobData>(
    TRANSCODE_QUEUE_NAME,
    processTranscodeJob,
    {
      connection: createQueueConnection(),
      concurrency: 1, // 1 job transcoding bersamaan, sesuai kapasitas 1 PC
    }
  );

  worker.on("completed", (job) => {
    console.log(`✅ Job ${job.id} (video: ${job.data.videoId}) selesai sepenuhnya`);
  });

  worker.on("failed", (job, error) => {
    console.error(`❌ Job ${job?.id} (video: ${job?.data.videoId}) gagal:`, error.message);
  });

  console.log(`👂 Worker mendengarkan queue "${TRANSCODE_QUEUE_NAME}"...`);
}

main().catch((error) => {
  console.error("❌ Worker gagal start:", error);
  process.exit(1);
});