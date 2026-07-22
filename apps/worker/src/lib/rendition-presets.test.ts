import { describe, expect, test } from "bun:test";
import { getActiveRenditionPresets, filterPresetsBySourceResolution, RENDITION_PRESETS } from "./rendition-presets";

describe("Rendition presets", () => {
  test("getActiveRenditionPresets return preset sesuai env TRANSCODE_RENDITIONS", () => {
    process.env.TRANSCODE_RENDITIONS = "720p,480p";
    const active = getActiveRenditionPresets();

    expect(active.length).toBe(2);
    expect(active.map((p) => p.label)).toEqual(["720p", "480p"]);

    process.env.TRANSCODE_RENDITIONS = "1080p,720p,480p,240p"; // reset
  });

  test("filterPresetsBySourceResolution skip rendition lebih tinggi dari sumber", () => {
    const filtered = filterPresetsBySourceResolution(RENDITION_PRESETS, 480);

    expect(filtered.map((p) => p.label)).toEqual(["480p", "240p"]);
  });

  test("filterPresetsBySourceResolution tetap proses minimal 1 rendition untuk sumber sangat kecil", () => {
    const filtered = filterPresetsBySourceResolution(RENDITION_PRESETS, 144);

    expect(filtered.length).toBe(1);
    expect(filtered[0].label).toBe("240p"); // preset terendah yang ada
  });

  test("filterPresetsBySourceResolution tidak skip apapun untuk sumber resolusi tinggi", () => {
    const filtered = filterPresetsBySourceResolution(RENDITION_PRESETS, 2160); // 4K

    expect(filtered.length).toBe(4);
  });
});