export interface RenditionPreset {
  label: string;       // "1080p", "720p", dst
  height: number;       // dipakai untuk scale filter FFmpeg
  bitrateKbps: number;
  audioBitrateKbps: number;
}

export const RENDITION_PRESETS: RenditionPreset[] = [
  { label: "1080p", height: 1080, bitrateKbps: 5000, audioBitrateKbps: 128 },
  { label: "720p", height: 720, bitrateKbps: 2800, audioBitrateKbps: 128 },
  { label: "480p", height: 480, bitrateKbps: 1400, audioBitrateKbps: 96 },
  { label: "240p", height: 240, bitrateKbps: 600, audioBitrateKbps: 64 },
];

/**
 * Ambil daftar preset yang aktif dikonfigurasi lewat env var
 * TRANSCODE_RENDITIONS, urut dari resolusi tertinggi ke terendah.
 */
export function getActiveRenditionPresets(): RenditionPreset[] {
  const activeLabels = (process.env.TRANSCODE_RENDITIONS ?? "1080p,720p,480p,240p")
    .split(",")
    .map((s) => s.trim());

  return RENDITION_PRESETS.filter((preset) => activeLabels.includes(preset.label));
}

/**
 * Filter preset supaya tidak upscale — cuma proses rendition yang
 * height-nya <= resolusi asli video.
 */
export function filterPresetsBySourceResolution(
  presets: RenditionPreset[],
  sourceHeight: number
): RenditionPreset[] {
  const filtered = presets.filter((preset) => preset.height <= sourceHeight);

  // Kalau semua preset lebih tinggi dari sumber (video sumber sangat kecil),
  // minimal proses 1 rendition dengan resolusi terendah yang ada
  if (filtered.length === 0 && presets.length > 0) {
    const lowestPreset = [...presets].sort((a, b) => a.height - b.height)[0];
    return [lowestPreset];
  }

  return filtered;
}