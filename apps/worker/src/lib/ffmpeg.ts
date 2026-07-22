import { getStoragePath } from "@mediaflow/storage";
import type { RenditionPreset } from "./rendition-presets";
import { mkdir } from "node:fs/promises";

export interface TranscodeProgress {
  percentage: number;
  currentTimeSec: number;
}

export interface TranscodeResult {
  playlistPath: string;
  playlistUrl: string;
}

/**
 * Jalankan FFmpeg untuk transcode 1 rendition tertentu ke format HLS.
 * Melaporkan progress secara real-time lewat callback, dengan parsing
 * output FFmpeg (`-progress pipe:1`).
 */
export async function transcodeToRendition(params: {
  inputPath: string;
  videoId: string;
  preset: RenditionPreset;
  totalDurationSec: number;
  onProgress?: (progress: TranscodeProgress) => void;
}): Promise<TranscodeResult> {
  const outputDir = getStoragePath("hls", params.videoId, params.preset.label);
  await mkdir(outputDir, { recursive: true });

  const playlistPath = `${outputDir}\\playlist.m3u8`;
  const segmentPattern = `${outputDir}\\segment_%03d.ts`;

  const ffmpegPath = process.env.FFMPEG_PATH ?? "ffmpeg";

  const args = [
    "-i", params.inputPath,
    "-vf", `scale=-2:${params.preset.height}`,
    "-c:v", "libx264",
    "-preset", "veryfast", // trade-off kecepatan vs kompresi, cocok untuk 1 PC
    "-b:v", `${params.preset.bitrateKbps}k`,
    "-maxrate", `${Math.round(params.preset.bitrateKbps * 1.2)}k`,
    "-bufsize", `${params.preset.bitrateKbps * 2}k`,
    "-c:a", "aac",
    "-b:a", `${params.preset.audioBitrateKbps}k`,
    "-hls_time", "6",
    "-hls_playlist_type", "vod",
    "-hls_segment_filename", segmentPattern,
    "-progress", "pipe:1", // kirim progress ke stdout, kita parse manual
    "-nostats",
    "-y", // overwrite kalau file sudah ada
    playlistPath,
  ];

  const proc = Bun.spawn([ffmpegPath, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  // Parse progress dari stdout secara streaming
  if (params.onProgress && proc.stdout) {
    parseProgressStream(proc.stdout, params.totalDurationSec, params.onProgress);
  }

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(
      `FFmpeg gagal transcode ke ${params.preset.label} (exit code ${exitCode}): ${stderr.slice(-500)}`
    );
  }

  return {
    playlistPath,
    playlistUrl: `/hls/${params.videoId}/${params.preset.label}/playlist.m3u8`,
  };
}

/**
 * Parse output `-progress pipe:1` FFmpeg yang berformat key=value per baris,
 * ekstrak `out_time_ms` untuk hitung persentase selesai secara real-time.
 */
async function parseProgressStream(
  stream: ReadableStream<Uint8Array>,
  totalDurationSec: number,
  onProgress: (progress: TranscodeProgress) => void
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const match = line.match(/^out_time_ms=(\d+)/);
        if (match) {
          const currentTimeSec = parseInt(match[1], 10) / 1_000_000;
          const percentage =
            totalDurationSec > 0
              ? Math.min(100, Math.round((currentTimeSec / totalDurationSec) * 100))
              : 0;

          onProgress({ percentage, currentTimeSec });
        }
      }
    }
  } catch {
    // Stream ditutup lebih awal (proses selesai) — bukan error, abaikan
  }
}