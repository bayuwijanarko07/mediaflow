import { describe, expect, test, afterEach } from "bun:test";
import { generateMasterPlaylist } from "./master-playlist";
import { getStoragePath, readFile, deleteDirectory } from "@mediaflow/storage";
import { RENDITION_PRESETS } from "./rendition-presets";

describe("generateMasterPlaylist", () => {
  const testVideoId = "test-master-playlist";

  afterEach(async () => {
    await deleteDirectory(getStoragePath("hls", testVideoId));
  });

  test("master playlist berisi referensi ke semua rendition, urut bitrate tertinggi dulu", async () => {
    const renditions = [
      { preset: RENDITION_PRESETS.find((p) => p.label === "480p")!, playlistUrl: "/hls/x/480p/playlist.m3u8" },
      { preset: RENDITION_PRESETS.find((p) => p.label === "720p")!, playlistUrl: "/hls/x/720p/playlist.m3u8" },
    ];

    const url = await generateMasterPlaylist({ videoId: testVideoId, renditions });

    expect(url).toBe(`/hls/${testVideoId}/master.m3u8`);

    const content = await readFile(getStoragePath("hls", testVideoId, "master.m3u8")).text();

    expect(content).toContain("#EXTM3U");
    expect(content).toContain("720p/playlist.m3u8");
    expect(content).toContain("480p/playlist.m3u8");

    // 720p (bitrate lebih tinggi) harus muncul SEBELUM 480p di file
    const index720 = content.indexOf("720p/playlist.m3u8");
    const index480 = content.indexOf("480p/playlist.m3u8");
    expect(index720).toBeLessThan(index480);
  });

  test("BANDWIDTH di master playlist sesuai bitrateKbps preset", async () => {
    const preset720 = RENDITION_PRESETS.find((p) => p.label === "720p")!;
    const renditions = [{ preset: preset720, playlistUrl: "/hls/x/720p/playlist.m3u8" }];

    await generateMasterPlaylist({ videoId: testVideoId, renditions });

    const content = await readFile(getStoragePath("hls", testVideoId, "master.m3u8")).text();

    expect(content).toContain(`BANDWIDTH=${preset720.bitrateKbps * 1000}`);
  });
});