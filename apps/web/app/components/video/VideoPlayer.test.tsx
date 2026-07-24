import { describe, expect, test, mock, afterEach } from "bun:test";
import React from "react";
import { render, within, cleanup, waitFor } from "@testing-library/react";
import { VideoPlayer } from "./VideoPlayer";

let capturedXhrSetup: ((xhr: XMLHttpRequest) => void) | null = null;

mock.module("hls.js", () => {
  class MockHls {
    static isSupported() {
      return true;
    }
    static Events = { MANIFEST_PARSED: "manifestParsed", ERROR: "error" };
    static ErrorTypes = { NETWORK_ERROR: "networkError", MEDIA_ERROR: "mediaError" };

    constructor(config: any) {
      capturedXhrSetup = config.xhrSetup;
    }
    loadSource() {}
    attachMedia() {}
    on(event: string, callback: (...args: any[]) => void) {
      if (event === "manifestParsed") {
        setTimeout(() => callback(), 0);
      }
    }
    destroy() {}
    startLoad() {}
    recoverMediaError() {}
  }

  return { default: MockHls };
});

mock.module("@/lib/token-store", () => ({
  getAccessToken: () => "fake-token-123",
}));

afterEach(() => {
  cleanup();
});

describe("VideoPlayer", () => {
  test("xhrSetup terpasang dan menyisipkan Authorization header", async () => {
    const { container } = render(
      <VideoPlayer videoId="video-1" masterPlaylistPath="/videos/video-1/playback/master.m3u8" />
    );

    await waitFor(() => {
      expect(capturedXhrSetup).not.toBeNull();
    });

    const fakeXhr = { setRequestHeader: mock(() => {}) } as unknown as XMLHttpRequest;
    capturedXhrSetup!(fakeXhr);

    expect(fakeXhr.setRequestHeader).toHaveBeenCalledWith(
      "Authorization",
      "Bearer fake-token-123"
    );
  });

  test("loading indicator hilang setelah manifest parsed", async () => {
    const { container } = render(
      <VideoPlayer videoId="video-1" masterPlaylistPath="/videos/video-1/playback/master.m3u8" />
    );
    const screen = within(container);

    await waitFor(() => {
      expect(screen.queryByText(/memuat/i)).toBeNull();
    });
  });

  test("video element ter-render dengan data-video-id yang benar", () => {
    const { container } = render(
      <VideoPlayer videoId="video-abc" masterPlaylistPath="/videos/video-abc/playback/master.m3u8" />
    );

    const videoElement = container.querySelector("video");
    expect(videoElement?.getAttribute("data-video-id")).toBe("video-abc");
  });
});