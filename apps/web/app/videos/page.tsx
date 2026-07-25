"use client";

import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/app/components/auth/ProtectedRoute";
import { VideoGrid } from "@/app/components/video/VideoGrid";
import { GenreFilter } from "@/app/components/video/GenreFilter";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";
import { api } from "@/lib/api-client";
import type { VideoCatalogResponse } from "@mediaflow/shared-types";

const PAGE_SIZE = 20;

export default function VideosCatalogPage() {
  const [search, setSearch] = useState("");
  const [genre, setGenre] = useState("");
  const [page, setPage] = useState(1);
  const [catalog, setCatalog] = useState<VideoCatalogResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search, 400);

  // Reset ke halaman 1 setiap kali filter berubah, supaya tidak
  // "nyangkut" di halaman kosong setelah ganti pencarian/genre
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, genre]);

  useEffect(() => {
    setIsLoading(true);
    setLoadError(null);

    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (genre) params.set("genre", genre);

    api
      .get<VideoCatalogResponse>(`/videos?${params.toString()}`)
      .then(setCatalog)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Gagal memuat katalog"))
      .finally(() => setIsLoading(false));
  }, [debouncedSearch, genre, page]);

  return (
    <ProtectedRoute>
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Katalog Video</h1>

        <GenreFilter
          searchValue={search}
          onSearchChange={setSearch}
          selectedGenre={genre}
          onGenreChange={setGenre}
        />

        {loadError && <p className="text-red-500 mb-4">{loadError}</p>}

        {isLoading ? (
          <p className="text-gray-500 text-center py-12">Memuat video...</p>
        ) : (
          <>
            <VideoGrid videos={catalog?.videos ?? []} />

            {catalog && catalog.pagination.totalPages > 1 && (
              <div className="flex justify-center items-center gap-4 mt-8">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-4 py-2 border rounded disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Sebelumnya
                </button>
                <span className="text-sm text-gray-600">
                  Halaman {catalog.pagination.page} dari {catalog.pagination.totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(catalog.pagination.totalPages, p + 1))}
                  disabled={page >= catalog.pagination.totalPages}
                  className="px-4 py-2 border rounded disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Berikutnya
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </ProtectedRoute>
  );
}