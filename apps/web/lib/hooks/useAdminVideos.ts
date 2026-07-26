"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { AdminVideoListResponse } from "@mediaflow/shared-types";

const POLL_INTERVAL_MS = 5000;

/**
 * Ambil list video admin dengan polling berkala — supaya progress
 * transcoding (PROCESSING) terlihat update tanpa perlu refresh manual.
 * Polling dihentikan otomatis kalau komponen unmount.
 */
export function useAdminVideos(statusFilter: string) {
  const [data, setData] = useState<AdminVideoListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVideos = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: "1", limit: "50" });
      if (statusFilter) params.set("status", statusFilter);

      const result = await api.get<AdminVideoListResponse>(`/videos/admin?${params.toString()}`);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat daftar video");
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    setIsLoading(true);
    fetchVideos();

    const interval = setInterval(fetchVideos, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchVideos]);

  return { data, isLoading, error, refetch: fetchVideos };
}