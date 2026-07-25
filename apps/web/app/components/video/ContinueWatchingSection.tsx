"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api-client";
import type { WatchHistoryItem, WatchHistoryResponse } from "@mediaflow/shared-types";

function formatDuration(sec: number | null): string {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ContinueWatchingSection() {
  const [items, setItems] = useState<WatchHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    api
      .get<WatchHistoryResponse>("/me/watch-history")
      .then((data) => {
        if (cancelled) return;
        // Hanya tampilkan yang belum selesai ditonton — video yang sudah
        // completed tidak relevan untuk "Lanjutkan Menonton"
        setItems(data.history.filter((h) => !h.completed));
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (isLoading || items.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold mb-3">Lanjutkan Menonton</h2>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {items.map((item) => {
          const progressPercent = item.durationSec
            ? Math.min(100, Math.round((item.progressSec / item.durationSec) * 100))
            : 0;

          return (
            <Link
              key={item.videoId}
              href={`/videos/${item.videoId}`}
              className="flex-shrink-0 w-56 rounded-lg overflow-hidden border border-gray-200 hover:shadow-md transition-shadow"
            >
              <div className="relative w-full aspect-video bg-gray-200">
                {item.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.thumbnailUrl}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
                  <div
                    className="h-full bg-red-600"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
              <div className="p-2">
                <p className="text-sm font-medium line-clamp-1">{item.title}</p>
                <p className="text-xs text-gray-500">
                  {formatDuration(item.progressSec)}
                  {item.durationSec ? ` / ${formatDuration(item.durationSec)}` : ""}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}