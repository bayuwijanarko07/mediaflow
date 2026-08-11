"use client";

import { RequireAdmin } from "@/app/components/auth/RequireAdmin";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface VideoDetail {
  id: string;
  title: string;
  status: string;
}

export default function VideoStatusPage() {
  const params = useParams();
  const videoId = params.id as string;
  const [video, setVideo] = useState<VideoDetail | null>(null);

  useEffect(() => {
    // Endpoint detail video publik akan dibuat lengkap di Issue #46.
    // Untuk sekarang, cukup tampilkan info dasar dari state redirect.
    setVideo({ id: videoId, title: "Video sedang diproses", status: "QUEUED" });
  }, [videoId]);

  return (
    <RequireAdmin>
      <main style={{ padding: 24 }}>
        <h1>Status Video</h1>
        {video && (
          <div>
            <p>Video ID: {video.id}</p>
            <p>Status: {video.status}</p>
            <p>
              Video sedang diproses (transcoding) di background. Halaman status
              lengkap dengan progress real-time akan tersedia di Issue #44/#53.
            </p>
          </div>
        )}
      </main>
    </RequireAdmin>
  );
}