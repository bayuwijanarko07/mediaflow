import { getStoragePath, saveFile } from "@mediaflow/storage";
import type { RenditionPreset } from "./rendition-presets";

interface RenditionResult {
  preset: RenditionPreset;
  playlistUrl: string;
}

/**
 * Buat master playlist HLS yang mereferensikan semua rendition yang
 * berhasil di-transcode, dengan bandwidth info supaya player (HLS.js)
 * bisa melakukan adaptive bitrate switching.
 */
export async function generateMasterPlaylist(params: {
  videoId: string;
  renditions: RenditionResult[];
}): Promise<string> {
  const lines = ["#EXTM3U", "#EXT-X-VERSION:3"];

  // Urutkan dari bitrate tertinggi ke terendah (konvensi umum HLS,
  // meski player tidak strict soal urutan ini)
  const sorted = [...params.renditions].sort(
    (a, b) => b.preset.bitrateKbps - a.preset.bitrateKbps
  );

  for (const rendition of sorted) {
    const bandwidth = rendition.preset.bitrateKbps * 1000; // kbps -> bps
    const resolution = getResolutionString(rendition.preset.height);

    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${resolution}`
    );
    lines.push(`${rendition.preset.label}/playlist.m3u8`);
  }

  const masterPlaylistContent = lines.join("\n") + "\n";
  const masterPlaylistPath = getStoragePath("hls", params.videoId, "master.m3u8");

  await saveFile(masterPlaylistPath, new TextEncoder().encode(masterPlaylistContent));

  return `/hls/${params.videoId}/master.m3u8`;
}

/**
 * Konversi height (dari preset) jadi string resolusi standar 16:9.
 * Ini asumsi umum karena kita sudah scale dengan width auto (-2)
 * mengikuti aspect ratio asli video, tapi untuk label di master
 * playlist, pakai standar 16:9 sebagai referensi umum player.
 */
function getResolutionString(height: number): string {
  const standardResolutions: Record<number, string> = {
    1080: "1920x1080",
    720: "1280x720",
    480: "854x480",
    240: "426x240",
  };
  return standardResolutions[height] ?? `${Math.round((height * 16) / 9)}x${height}`;
}