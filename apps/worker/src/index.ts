import { Worker } from "bullmq";
import { prisma } from "@mediaflow/database";
import { ensureStorageDirs } from "@mediaflow/storage";
import { createQueueConnection, TRANSCODE_QUEUE_NAME } from "@mediaflow/queue";
import type { TranscodeJobData } from "@mediaflow/queue";

async function main() {
  console.log("🔧 Mediaflow Worker started");

  await ensureStorageDirs();
  await prisma.$connect();
  console.log("✅ Database & storage siap");

  const worker = new Worker<TranscodeJobData>(
    TRANSCODE_QUEUE_NAME,
    async (job) => {
      console.log(`📦 Job diterima: ${job.id}`, job.data);

      // Placeholder — logic transcoding sesungguhnya akan
      // diimplementasikan di Issue #40-41
      console.log(`(Placeholder) Memproses video ${job.data.videoId}...`);

      return { processed: true };
    },
    {
      connection: createQueueConnection(),
      concurrency: 1, // cukup 1 job diproses bersamaan, sesuai kapasitas 1 PC
    }
  );

  worker.on("completed", (job) => {
    console.log(`✅ Job ${job.id} selesai`);
  });

  worker.on("failed", (job, error) => {
    console.error(`❌ Job ${job?.id} gagal:`, error.message);
  });

  console.log(`👂 Worker mendengarkan queue "${TRANSCODE_QUEUE_NAME}"...`);
}

main().catch((error) => {
  console.error("❌ Worker gagal start:", error);
  process.exit(1);
});