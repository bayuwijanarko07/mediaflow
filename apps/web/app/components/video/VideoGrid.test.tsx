import { describe, expect, test, afterEach } from "bun:test";
import React from "react";
import { render, within, cleanup } from "@testing-library/react";
import { VideoGrid } from "./VideoGrid";
import type { VideoCatalogItem } from "@mediaflow/shared-types";

afterEach(() => {
  cleanup();
});

const sampleVideo: VideoCatalogItem = {
  id: "v1",
  title: "Video Contoh",
  thumbnailUrl: null,
  durationSec: 125,
  viewCount: 10,
  genres: ["Action"],
  createdAt: new Date().toISOString(),
};

describe("VideoGrid", () => {
  test("menampilkan pesan kosong kalau tidak ada video", () => {
    const { container } = render(<VideoGrid videos={[]} />);
    const screen = within(container);

    expect(screen.getByText("Tidak ada video ditemukan")).toBeDefined();
  });

  test("menampilkan pesan kosong custom kalau diberikan", () => {
    const { container } = render(
      <VideoGrid videos={[]} emptyMessage="Belum ada hasil pencarian" />
    );
    const screen = within(container);

    expect(screen.getByText("Belum ada hasil pencarian")).toBeDefined();
  });

  test("menampilkan kartu video sesuai data", () => {
    const { container } = render(<VideoGrid videos={[sampleVideo]} />);
    const screen = within(container);

    expect(screen.getByText("Video Contoh")).toBeDefined();
    expect(screen.getByText(/10 kali ditonton/)).toBeDefined();
  });
});