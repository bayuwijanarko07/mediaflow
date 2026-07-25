"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { VideoCard } from "./VideoCard";
import type { VideoCatalogItem } from "@mediaflow/shared-types";

interface TrendingResponse {
  videos: VideoCatalogItem[];
}

export function TrendingSection() {
  const [videos, setVideos] = useState<VideoCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    api
      .get<TrendingResponse>("/videos/trending?limit=10")
      .then((data) => {
        if (!cancelled) setVideos(data.videos);
      })
      .catch(() => {
        if (!cancelled) setVideos([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading || videos.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold mb-3">Trending</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {videos.map((video) => (
          <VideoCard key={video.id} video={video} />
        ))}
      </div>
    </section>
  );
}