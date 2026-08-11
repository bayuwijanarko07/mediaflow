"use client";

import { useState } from "react";
import { RequireAdmin } from "@/app/components/auth/RequireAdmin";
import { StatusBadge } from "@/app/components/admin/StatusBadge";
import { useAdminVideos } from "@/lib/hooks/useAdminVideos";
import { api } from "@/lib/api-client";
import Link from "next/link";
import type { AdminVideoListItem } from "@mediaflow/shared-types";

const STATUS_OPTIONS = ["", "UPLOADING", "UPLOADED", "QUEUED", "PROCESSING", "READY", "FAILED"];

export default function AdminVideosDashboardPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const { data, isLoading, error, refetch } = useAdminVideos(statusFilter);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const handleRetry = async (videoId: string) => {
    setActionError(null);
    setPendingAction(videoId);
    try {
      await api.post(`/videos/admin/${videoId}/retry`);
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal retry video");
    } finally {
      setPendingAction(null);
    }
  };

  const handleDelete = async (videoId: string, title: string) => {
    if (!confirm(`Hapus video "${title}"? Tindakan ini tidak bisa dibatalkan.`)) return;

    setActionError(null);
    setPendingAction(videoId);
    try {
      await api.delete(`/videos/admin/${videoId}`);
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal menghapus video");
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <RequireAdmin>
      <main className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Dashboard Admin — Video</h1>
          <Link
            href="/admin/upload"
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            + Upload Video Baru
          </Link>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status || "ALL"}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-full border text-sm ${
                statusFilter === status
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-300"
              }`}
            >
              {status || "Semua"}
            </button>
          ))}
        </div>

        {error && <p className="text-red-500 mb-4">{error}</p>}
        {actionError && <p className="text-red-500 mb-4">{actionError}</p>}

        {isLoading && !data ? (
          <p className="text-gray-500 text-center py-12">Memuat daftar video...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b text-left text-sm text-gray-500">
                  <th className="py-2 pr-4">Judul</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Progress</th>
                  <th className="py-2 pr-4">Views</th>
                  <th className="py-2 pr-4">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {(data?.videos ?? []).map((video) => (
                  <VideoRow
                    key={video.id}
                    video={video}
                    isPending={pendingAction === video.id}
                    onRetry={() => handleRetry(video.id)}
                    onDelete={() => handleDelete(video.id, video.title)}
                  />
                ))}
              </tbody>
            </table>

            {data && data.videos.length === 0 && (
              <p className="text-gray-500 text-center py-12">Tidak ada video pada status ini</p>
            )}
          </div>
        )}
      </main>
    </RequireAdmin>
  );
}

interface VideoRowProps {
  video: AdminVideoListItem;
  isPending: boolean;
  onRetry: () => void;
  onDelete: () => void;
}

function VideoRow({ video, isPending, onRetry, onDelete }: VideoRowProps) {
  return (
    <tr className="border-b text-sm">
      <td className="py-2 pr-4">
        <p className="font-medium">{video.title}</p>
        {video.latestJob?.errorMessage && (
          <p className="text-xs text-red-500 mt-0.5">{video.latestJob.errorMessage}</p>
        )}
      </td>
      <td className="py-2 pr-4">
        <StatusBadge status={video.status} />
      </td>
      <td className="py-2 pr-4 w-32">
        {video.latestJob && video.status === "PROCESSING" ? (
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-600 h-2 transition-all"
              style={{ width: `${video.latestJob.progress}%` }}
            />
          </div>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="py-2 pr-4">{video.viewCount}</td>
      <td className="py-2 pr-4">
        <div className="flex gap-2">
          {video.status === "FAILED" && (
            <button
              onClick={onRetry}
              disabled={isPending}
              className="px-2 py-1 bg-yellow-600 text-white rounded text-xs disabled:opacity-50"
            >
              {isPending ? "..." : "Retry"}
            </button>
          )}
          <Link
            href={`/admin/videos/${video.id}/edit`}
            className="px-2 py-1 bg-yellow-200 rounded text-xs"
          >
            Edit
          </Link>
          <button
            onClick={onDelete}
            disabled={isPending}
            className="px-2 py-1 bg-red-600 text-white rounded text-xs disabled:opacity-50"
          >
            {isPending ? "..." : "Hapus"}
          </button>
        </div>
      </td>
    </tr>
  );
}