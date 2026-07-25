import { describe, expect, test, mock, afterEach } from "bun:test";
import React from "react";
import { render, within, cleanup, waitFor, fireEvent } from "@testing-library/react";
import VideosCatalogPage from "./page";

mock.module("@/context/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

mock.module("next/navigation", () => ({
  useRouter: () => ({ replace: mock(() => {}) }),
  usePathname: () => "/videos",
}));

afterEach(() => {
  cleanup();
});

function mockFetchSequence(responses: Record<string, unknown>) {
  global.fetch = mock(async (url: string) => {
    if (url.includes("/genres")) {
      return new Response(JSON.stringify({ genres: [] }), { status: 200 });
    }
    if (url.includes("/videos?")) {
      return new Response(JSON.stringify(responses.videos), { status: 200 });
    }
    return new Response(null, { status: 404 });
  }) as unknown as typeof fetch;
}

describe("VideosCatalogPage", () => {
  test("menampilkan grid video dari hasil fetch", async () => {
    mockFetchSequence({
      videos: {
        videos: [
          {
            id: "v1",
            title: "Video Katalog Test",
            thumbnailUrl: null,
            durationSec: 60,
            viewCount: 5,
            genres: [],
            createdAt: new Date().toISOString(),
          },
        ],
        pagination: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
      },
    });

    const { container } = render(<VideosCatalogPage />);
    const screen = within(container);

    await waitFor(() => {
      expect(screen.getByText("Video Katalog Test")).toBeDefined();
    });
  });

  test("input search memicu fetch dengan query search setelah debounce", async () => {
    let lastUrl = "";
    global.fetch = mock(async (url: string) => {
      lastUrl = url;
      if (url.includes("/genres")) {
        return new Response(JSON.stringify({ genres: [] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          videos: [],
          pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 0 },
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    const { container } = render(<VideosCatalogPage />);
    const screen = within(container);

    const searchInput = screen.getByPlaceholderText("Cari judul video...");
    fireEvent.change(searchInput, { target: { value: "aksi" } });

    await waitFor(
      () => {
        expect(lastUrl).toContain("search=aksi");
      },
      { timeout: 1000 }
    );
  });

  test("menampilkan pesan kosong kalau tidak ada hasil", async () => {
    mockFetchSequence({
      videos: {
        videos: [],
        pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 0 },
      },
    });

    const { container } = render(<VideosCatalogPage />);
    const screen = within(container);

    await waitFor(() => {
      expect(screen.getByText("Tidak ada video ditemukan")).toBeDefined();
    });
  });
});