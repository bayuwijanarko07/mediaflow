"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { getAccessToken } from "@/lib/token-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface VideoPlayerProps {
  videoId: string;
  masterPlaylistPath: string; // contoh: "/videos/{id}/playback/master.m3u8"
  onTimeUpdate?: (currentTimeSec: number) => void;
  initialPositionSec?: number;
}

export function VideoPlayer({
  videoId,
  masterPlaylistPath,
  onTimeUpdate,
  initialPositionSec,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const fullPlaylistUrl = `${API_URL}${masterPlaylistPath}`;
    setError(null);
    setIsLoading(true);

    if (Hls.isSupported()) {
      const hls = new Hls({
        // Custom xhrSetup — ini titik krusial yang menyelesaikan masalah
        // "attach Authorization header" yang disebut di Issue #47. Setiap
        // request HLS.js (baik untuk playlist maupun segment .ts) akan
        // lewat sini dan otomatis ditambahkan header Bearer token.
        xhrSetup: (xhr) => {
          const token = getAccessToken();
          if (token) {
            xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          }
        },
      });

      hlsRef.current = hls;

      hls.loadSource(fullPlaylistUrl);
      hls.attachMedia(videoElement);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        if (initialPositionSec && initialPositionSec > 0) {
          videoElement.currentTime = initialPositionSec;
        }
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        console.error("HLS error:", data);

        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setError("Gagal memuat video (masalah jaringan)");
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              setError("Terjadi masalah pemutaran, mencoba pulihkan...");
              hls.recoverMediaError();
              break;
            default:
              setError("Terjadi kesalahan tidak terduga saat memutar video");
              hls.destroy();
              break;
          }
        }
      });

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    // Safari punya native HLS support built-in lewat tag <video> biasa —
    // tidak perlu HLS.js sama sekali, dan justru HLS.js akan konflik
    // kalau dipaksakan di Safari.
    const isNativeHlsSupported = videoElement.canPlayType(
      "application/vnd.apple.mpegurl"
    );

    if (isNativeHlsSupported) {
      // Safari: fetch native browser tidak bisa di-attach header custom
      // langsung ke <video> src, jadi kita pakai trik fetch blob URL
      // (Segment berikutnya akan di-fetch native oleh Safari sendiri,
      // yang tidak butuh header karena request-nya same-origin cookie-based
      // TIDAK berlaku di sini karena kita pakai Bearer token, bukan cookie
      // — ini keterbatasan yang diterima untuk skala kecil project ini.)
      fetch(fullPlaylistUrl, {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      })
        .then((res) => res.blob())
        .then((blob) => {
          videoElement.src = URL.createObjectURL(blob);
          setIsLoading(false);
          if (initialPositionSec && initialPositionSec > 0) {
            videoElement.currentTime = initialPositionSec;
          }
        })
        .catch(() => {
          setError("Gagal memuat video (Safari native HLS)");
          setIsLoading(false);
        });

      return;
    }

    setError("Browser ini tidak mendukung pemutaran video HLS");
    setIsLoading(false);
  }, [masterPlaylistPath, initialPositionSec]);

  // Laporkan posisi tontonan secara berkala (dipakai Issue #50 nanti)
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !onTimeUpdate) return;

    let lastReported = 0;
    const handleTimeUpdate = () => {
      const current = Math.floor(videoElement.currentTime);
      // Throttle: laporkan cuma tiap ~15 detik (sesuai PRD #50), bukan tiap frame — 
      // supaya tidak membanjiri backend dengan request watch-progress
      if (Math.abs(current - lastReported) >= 15) {
        lastReported = current;
        onTimeUpdate(current);
      }
    };

    videoElement.addEventListener("timeupdate", handleTimeUpdate);
    return () => videoElement.removeEventListener("timeupdate", handleTimeUpdate);
  }, [onTimeUpdate]);

  return (
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-10">
          <p className="text-white text-center px-4">{error}</p>
        </div>
      )}

      <video
        ref={videoRef}
        controls
        className="w-full h-full"
        data-video-id={videoId}
      />
    </div>
  );
}