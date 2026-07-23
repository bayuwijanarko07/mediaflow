import type { Job } from "bullmq";
import type { TranscodeJobData } from "@mediaflow/queue";
import { probeVideo } from "../lib/ffprobe";
import { transcodeToRendition } from "../lib/ffmpeg";
import { getActiveRenditionPresets, filterPresetsBySourceResolution } from "../lib/rendition-presets";
import { generateMasterPlaylist } from "../lib/master-playlist";
import { deleteFile, deleteDirectory, getStoragePath } from "@mediaflow/storage";
import {
  markVideoProcessing,
  markVideoReady,
  markVideoFailed,
  createTranscodeJobRecord,
  updateTranscodeJobProgress,
  completeTranscodeJobRecord,
  failTranscodeJobRecord,
  createVideoRendition,
} from "../services/transcode-status.service";

export async function processTranscodeJob(job: Job<TranscodeJobData>): Promise<void> {
  const { videoId, rawFilePath } = job.data;
  const maxAttempts = job.opts.attempts ?? 1;
  const currentAttempt = job.attemptsMade + 1; // attemptsMade mulai dari 0 di percobaan pertama

  console.log(`\n🎬 Memulai transcoding untuk video ${videoId}`);
  console.log(`   File sumber: ${rawFilePath}`);

  await markVideoProcessing(videoId);
  const jobRecord = await createTranscodeJobRecord(videoId);

  // Bersihkan sisa output HLS parsial dari percobaan sebelumnya (kalau ada)
  // supaya tidak ada file segment lama tercampur dengan hasil percobaan baru
  await deleteDirectory(getStoragePath("hls", videoId));

  try {
    // 1. Baca metadata video sumber
    const metadata = await probeVideo(rawFilePath);
    console.log(`   Resolusi sumber: ${metadata.width}x${metadata.height}, durasi: ${metadata.durationSec}s`);

    // 2. Tentukan rendition mana saja yang perlu diproses (skip upscale)
    const allPresets = getActiveRenditionPresets();
    const applicablePresets = filterPresetsBySourceResolution(allPresets, metadata.height);
    console.log(`   Rendition yang akan diproses: ${applicablePresets.map((p) => p.label).join(", ")}`);

    // 3. Transcode tiap rendition SATU PER SATU (sekuensial, sesuai
    // kapasitas 1 PC — bukan paralel, supaya tidak membebani CPU berlebihan)
    const renditionResults: { preset: typeof applicablePresets[0]; playlistUrl: string }[] = [];

    for (let i = 0; i < applicablePresets.length; i++) {
      const preset = applicablePresets[i];

      console.log(`\n   [${i + 1}/${applicablePresets.length}] Transcoding ke ${preset.label}...`);

      const result = await transcodeToRendition({
        inputPath: rawFilePath,
        videoId,
        preset,
        totalDurationSec: metadata.durationSec,
        onProgress: (progress) => {
          // Progress keseluruhan = kombinasi rendition yang sudah selesai
          // + progress rendition yang sedang berjalan, dibagi rata
          // ke semua rendition yang perlu diproses.
          const overallProgress = Math.round(
            ((i + progress.percentage / 100) / applicablePresets.length) * 100
          );

          // Update ke BullMQ job (bisa dicek lewat job.progress di API)
          job.updateProgress(overallProgress);

          // Update ke database (dibaca dashboard admin, Issue #44/#53)
          updateTranscodeJobProgress(jobRecord.id, overallProgress).catch((err) =>
            console.error("Gagal update progress ke database:", err)
          );

          process.stdout.write(`\r      Progress: ${progress.percentage}%`);
        },
      });

      console.log(`\n      ✅ ${preset.label} selesai`);

      await createVideoRendition({
        videoId,
        resolution: preset.label,
        bitrateKbps: preset.bitrateKbps,
        playlistUrl: result.playlistUrl,
      });

      renditionResults.push({ preset, playlistUrl: result.playlistUrl });
    }

    if (renditionResults.length === 0) {
      throw new Error("Tidak ada rendition yang berhasil diproses");
    }

    // 4. Generate master playlist yang mereferensikan semua rendition
    console.log(`\n   Membuat master playlist...`);
    const masterPlaylistUrl = await generateMasterPlaylist({
      videoId,
      renditions: renditionResults,
    });

    // 5. Update status Video jadi READY
    await markVideoReady({
      videoId,
      durationSec: metadata.durationSec,
      masterPlaylistUrl,
    });

    await completeTranscodeJobRecord(jobRecord.id);

    // 6. PENTING (sesuai keputusan PRD): hapus raw file HANYA setelah
    // semua rendition benar-benar sukses tervalidasi (kita sudah sampai
    // di titik ini, artinya semua langkah di atas berhasil tanpa error)
    await deleteFile(rawFilePath);
    console.log(`   🗑️  Raw file dihapus: ${rawFilePath}`);

    console.log(`\n✅ Transcoding video ${videoId} SELESAI\n`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const isFinalAttempt = currentAttempt >= maxAttempts;

    console.error(
      `\n❌ Transcoding video ${videoId} GAGAL di percobaan ${currentAttempt}/${maxAttempts}:`,
      errorMessage
    );

    await failTranscodeJobRecord(jobRecord.id, errorMessage);
    if (isFinalAttempt) {
      // Baru di sini status Video benar-benar di-set FAILED —
      // setelah SEMUA percobaan retry habis, bukan di percobaan pertama gagal
      console.error(`   ⛔ Semua percobaan (${maxAttempts}) sudah habis. Video ditandai FAILED permanen.`);
      await markVideoFailed(videoId);
    } else {
      console.log(`   🔄 Akan di-retry otomatis oleh BullMQ (percobaan ${currentAttempt + 1}/${maxAttempts})...`);
      // Status Video TETAP "PROCESSING" — mencerminkan kondisi
      // sesungguhnya (masih ada percobaan lagi yang akan berjalan),
      // bukan FAILED yang menyesatkan.
    }

    // Raw file TIDAK PERNAH dihapus di jalur error, apa pun kondisinya —
    // baik masih akan di-retry maupun sudah final gagal, supaya admin
    // selalu bisa retry manual (Issue #44) tanpa perlu upload ulang.

    throw error; // penting: tetap lempar ulang supaya BullMQ tahu job ini gagal
  }
}