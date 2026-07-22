export interface VideoMetadata {
  width: number;
  height: number;
  durationSec: number;
}

/**
 * Jalankan ffprobe untuk membaca metadata video (resolusi, durasi)
 * sebelum transcoding dimulai.
 */
export async function probeVideo(filePath: string): Promise<VideoMetadata> {
  const ffprobePath = (process.env.FFMPEG_PATH ?? "ffmpeg").replace(
    /ffmpeg(\.exe)?$/i,
    "ffprobe$1"
  );

  const proc = Bun.spawn(
    [
      ffprobePath,
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height:format=duration",
      "-of",
      "json",
      filePath,
    ],
    { stdout: "pipe", stderr: "pipe" }
  );

  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`ffprobe gagal (exit code ${exitCode}): ${stderr}`);
  }

  const data = JSON.parse(output);
  const stream = data.streams?.[0];

  if (!stream) {
    throw new Error("Tidak dapat membaca metadata video (stream tidak ditemukan)");
  }

  return {
    width: stream.width,
    height: stream.height,
    durationSec: Math.round(parseFloat(data.format?.duration ?? "0")),
  };
}