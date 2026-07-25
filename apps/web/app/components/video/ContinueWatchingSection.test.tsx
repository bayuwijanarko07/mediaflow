import { describe, expect, test, mock, afterEach } from "bun:test";
import React from "react";
import { render, within, cleanup, waitFor } from "@testing-library/react";
import { ContinueWatchingSection } from "./ContinueWatchingSection";

afterEach(() => {
  cleanup();
});

describe("ContinueWatchingSection", () => {
  test("tidak render apapun kalau watch history kosong", async () => {
    global.fetch = mock(async () => {
      return new Response(JSON.stringify({ history: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    const { container } = render(<ContinueWatchingSection />);

    await waitFor(() => {
      expect(container.querySelector("section")).toBeNull();
    });
  });

  test("menampilkan video yang belum completed, menyembunyikan yang sudah completed", async () => {
    global.fetch = mock(async () => {
      return new Response(
        JSON.stringify({
          history: [
            {
              videoId: "v1",
              title: "Belum Selesai",
              thumbnailUrl: null,
              durationSec: 100,
              progressSec: 40,
              completed: false,
              lastWatchedAt: new Date().toISOString(),
            },
            {
              videoId: "v2",
              title: "Sudah Selesai",
              thumbnailUrl: null,
              durationSec: 100,
              progressSec: 99,
              completed: true,
              lastWatchedAt: new Date().toISOString(),
            },
          ],
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    const { container } = render(<ContinueWatchingSection />);
    const screen = within(container);

    await waitFor(() => {
      expect(screen.getByText("Belum Selesai")).toBeDefined();
    });

    expect(screen.queryByText("Sudah Selesai")).toBeNull();
  });

  test("tidak crash kalau fetch watch-history gagal", async () => {
    global.fetch = mock(async () => {
      return new Response(JSON.stringify({ message: "error" }), { status: 500 });
    }) as unknown as typeof fetch;

    const { container } = render(<ContinueWatchingSection />);

    await waitFor(() => {
      expect(container.querySelector("section")).toBeNull();
    });
  });
});