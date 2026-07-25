import Link from "next/link";
import type { VideoCatalogItem } from "@mediaflow/shared-types";

function formatDuration(sec: number | null): string {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface VideoCardProps {
  video: VideoCatalogItem;
}

export function VideoCard({ video }: VideoCardProps) {
  return (
    <Link
      href={`/videos/${video.id}`}
      className="block rounded-lg overflow-hidden border border-gray-200 hover:shadow-md transition-shadow bg-white"
    >
      <div className="relative w-full aspect-video bg-gray-200">
        {video.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
            Tanpa thumbnail
          </div>
        )}
        {video.durationSec !== null && (
          <span className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
            {formatDuration(video.durationSec)}
          </span>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-medium line-clamp-2">{video.title}</p>
        <p className="text-xs text-gray-500 mt-1">
          {video.viewCount} kali ditonton
          {video.genres.length > 0 && ` • ${video.genres.join(", ")}`}
        </p>
      </div>
    </Link>
  );
}