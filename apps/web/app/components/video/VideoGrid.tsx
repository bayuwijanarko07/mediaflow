import type { VideoCatalogItem } from "@mediaflow/shared-types";
import { VideoCard } from "./VideoCard";

interface VideoGridProps {
  videos: VideoCatalogItem[];
  emptyMessage?: string;
}

export function VideoGrid({ videos, emptyMessage = "Tidak ada video ditemukan" }: VideoGridProps) {
  if (videos.length === 0) {
    return <p className="text-gray-500 text-center py-12">{emptyMessage}</p>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {videos.map((video) => (
        <VideoCard key={video.id} video={video} />
      ))}
    </div>
  );
}