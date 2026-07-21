import { describe, expect, test, mock, afterEach } from "bun:test";
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useChunkedUpload } from "./useChunkedUpload";

afterEach(() => {
  mock.restore();
});

function createFakeFile(sizeBytes: number, name = "test.mp4"): File {
  const buffer = new ArrayBuffer(sizeBytes);
  return new File([buffer], name, { type: "video/mp4" });
}

describe("useChunkedUpload", () => {
  test("alur upload sukses: init -> chunk -> complete", async () => {
    let chunksReceived = 0;

    global.fetch = mock(async (url: string, options?: RequestInit) => {
      if (url.includes("/upload/init")) {
        return new Response(
          JSON.stringify({ uploadId: "test-upload-1", chunkSize: 5 * 1024 * 1024, totalChunks: 2 }),
          { status: 201 }
        );
      }
      if (url.includes("/chunk/")) {
        chunksReceived++;
        return new Response(
          JSON.stringify({ message: "ok", progress: { received: chunksReceived, total: 2, percentage: chunksReceived * 50 } }),
          { status: 200 }
        );
      }
      if (url.includes("/complete")) {
        return new Response(
          JSON.stringify({ message: "selesai", video: { id: "video-123", title: "Test", status: "QUEUED" } }),
          { status: 201 }
        );
      }
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useChunkedUpload());

    const fakeFile = createFakeFile(50 * 1024 * 1024); // 8MB -> 2 chunk @ 5MB

    await act(async () => {
      await result.current.startUpload(fakeFile, { title: "Test Video" });
    });

    await waitFor(() => {
      expect(result.current.status).toBe("success");
    });

    expect(result.current.videoId).toBe("video-123");
    expect(result.current.progressPercentage).toBe(100);
  });

  test("status jadi error kalau init gagal", async () => {
    global.fetch = mock(async () => {
      return new Response(JSON.stringify({ message: "Gagal init" }), { status: 500 });
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useChunkedUpload());
    const fakeFile = createFakeFile(1024);

    await act(async () => {
      await result.current.startUpload(fakeFile, { title: "Test" });
    });

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });

    expect(result.current.errorMessage).toBeDefined();
  });

  test("retry otomatis kalau chunk pertama kali gagal lalu sukses", async () => {
    let chunkAttempts = 0;

    global.fetch = mock(async (url: string) => {
      if (url.includes("/upload/init")) {
        return new Response(
          JSON.stringify({ uploadId: "retry-test", chunkSize: 5 * 1024 * 1024, totalChunks: 1 }),
          { status: 201 }
        );
      }
      if (url.includes("/chunk/")) {
        chunkAttempts++;
        if (chunkAttempts === 1) {
          // Gagal di percobaan pertama
          return new Response(JSON.stringify({ message: "error" }), { status: 500 });
        }
        return new Response(
          JSON.stringify({ message: "ok", progress: { received: 1, total: 1, percentage: 100 } }),
          { status: 200 }
        );
      }
      if (url.includes("/complete")) {
        return new Response(
          JSON.stringify({ message: "selesai", video: { id: "video-retry", title: "Test", status: "QUEUED" } }),
          { status: 201 }
        );
      }
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useChunkedUpload());
    const fakeFile = createFakeFile(1024 * 1024);

    await act(async () => {
      await result.current.startUpload(fakeFile, { title: "Test" });
    });

    await waitFor(() => {
      expect(result.current.status).toBe("success");
    }, { timeout: 5000 });

    expect(chunkAttempts).toBeGreaterThan(1); // konfirmasi retry benar-benar terjadi
  }, 10000);

  test("resumeUpload: hanya upload chunk yang belum terkirim berdasarkan /status", async () => {
    const uploadedChunkIndexes: number[] = [];

    global.fetch = mock(async (url: string) => {
      if (url.includes("/status")) {
        return new Response(
          JSON.stringify({
            uploadId: "resume-123",
            totalChunks: 3,
            receivedChunks: [0], // chunk index 0 sudah pernah sukses ter-upload
            isComplete: false,
          }),
          { status: 200 }
        );
      }
      if (url.includes("/chunk/")) {
        const parts = url.split("/");
        const chunkIndex = parseInt(parts[parts.length - 1], 10);
        uploadedChunkIndexes.push(chunkIndex);
        return new Response(
          JSON.stringify({ message: "ok" }),
          { status: 200 }
        );
      }
      if (url.includes("/complete")) {
        return new Response(
          JSON.stringify({ message: "selesai", video: { id: "video-resumed", title: "Resumed", status: "QUEUED" } }),
          { status: 201 }
        );
      }
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useChunkedUpload());
    const fakeFile = createFakeFile(15 * 1024 * 1024, "resumed.mp4"); // 15MB file

    await act(async () => {
      await result.current.resumeUpload("resume-123", fakeFile, 5 * 1024 * 1024, 3);
    });

    await waitFor(() => {
      expect(result.current.status).toBe("success");
    });

    // Chunk 0 tidak boleh di-upload ulang, hanya chunk 1 dan 2
    expect(uploadedChunkIndexes.sort()).toEqual([1, 2]);
    expect(result.current.videoId).toBe("video-resumed");
    expect(result.current.progressPercentage).toBe(100);
  });
});