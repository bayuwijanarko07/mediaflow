import { Queue } from "bullmq";
import { createQueueConnection, TRANSCODE_QUEUE_NAME } from "@mediaflow/queue";
import type { TranscodeJobData } from "@mediaflow/queue";

export const transcodeQueue = new Queue<TranscodeJobData>(TRANSCODE_QUEUE_NAME, {
  connection: createQueueConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000, // percobaan berikutnya: 5s, 10s, 20s
    },
    removeOnComplete: {
      age: 24 * 60 * 60, // hapus record job sukses setelah 24 jam
    },
    removeOnFail: false, // simpan job gagal untuk investigasi manual
  },
});