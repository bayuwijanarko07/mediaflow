import { describe, expect, test, mock, afterEach } from "bun:test";
import { renderHook, waitFor } from "@testing-library/react";
import { useAdminVideos } from "./useAdminVideos";

afterEach(() => {
  mock.restore();
});

describe("useAdminVideos", () => {
  test("mengambil data video dari GET /videos/admin", async () => {
    global.fetch = mock(async (url: string) => {
      expect(url).toContain("/videos/admin");
      return new Response(
        JSON.stringify({
          videos: [
            {
              id: "v1",
              title: "Video Admin Test",
              status: "READY",
              thumbnailUrl: null,
              durationSec: 60,
              viewCount: 3,
              createdAt: new Date().toISOString(),
              latestJob: null,
            },
          ],
          pagination: { page: 1, limit: 50, totalItems: 1, totalPages: 1 },
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useAdminVideos(""));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data?.videos[0].title).toBe("Video Admin Test");
  });

  test("menyertakan query status ketika statusFilter diberikan", async () => {
    let capturedUrl = "";
    global.fetch = mock(async (url: string) => {
      capturedUrl = url;
      return new Response(
        JSON.stringify({
          videos: [],
          pagination: { page: 1, limit: 50, totalItems: 0, totalPages: 0 },
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useAdminVideos("FAILED"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(capturedUrl).toContain("status=FAILED");
  });

  test("set error state kalau fetch gagal", async () => {
    global.fetch = mock(async () => {
      return new Response(JSON.stringify({ message: "Server error" }), { status: 500 });
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useAdminVideos(""));

    await waitFor(() => {
      expect(result.current.error).toBe("Server error");
    });
  });
});