"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ProtectedRoute } from "@/app/components/auth/ProtectedRoute";
import { VideoPlayer } from "@/app/components/video/VideoPlayer";
import { api } from "@/lib/api-client";
import type { VideoDetail, PlaybackInitResponse } from "@mediaflow/shared-types";

export default function VideoDetailPage() {
  const params = useParams();
  const videoId = params.id as string;

  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [playbackInfo, setPlaybackInfo] = useState<PlaybackInitResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function loadVideo() {
      try {
        const detailData = await api.get<{ video: VideoDetail }>(`/videos/${videoId}`);
        setVideo(detailData.video);

        const playback = await api.get<PlaybackInitResponse>(`/videos/${videoId}/playback`);
        setPlaybackInfo(playback);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Gagal memuat video");
      }
    }

    loadVideo();
  }, [videoId]);

  return (
    <ProtectedRoute>
      <main className="max-w-4xl mx-auto p-6">
        {loadError && <p className="text-red-500">{loadError}</p>}

        {video && playbackInfo && (
          <>
            <VideoPlayer videoId={video.id} masterPlaylistPath={playbackInfo.masterPlaylistUrl} />

            <div className="mt-4">
              <h1 className="text-2xl font-bold">{video.title}</h1>
              <p className="text-gray-500 text-sm mt-1">
                {video.viewCount} kali ditonton
                {video.genres.length > 0 && ` • ${video.genres.join(", ")}`}
              </p>
              {video.description && <p className="mt-3 text-gray-700">{video.description}</p>}
            </div>
          </>
        )}

        {!video && !loadError && <p>Memuat video...</p>}
      </main>
    </ProtectedRoute>
  );
}