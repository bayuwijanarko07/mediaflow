"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ProtectedRoute } from "@/app/components/auth/ProtectedRoute";
import { apiFetch, api } from "@/lib/api-client";
import type { Genre } from "@mediaflow/shared-types";

export default function EditVideoPage() {
  const params = useParams();
  const router = useRouter();
  const videoId = params.id as string;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [genres, setGenres] = useState<Genre[]>([]);
  const [selectedGenreIds, setSelectedGenreIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [videoRes, genresRes] = await Promise.all([
          apiFetch(`/videos/${videoId}`).then((r) => r.json()).catch(() => null),
          apiFetch("/genres").then((r) => r.json()),
        ]);

        setGenres(genresRes.genres ?? []);

        // Endpoint publik /videos/:id hanya mengembalikan video READY;
        // untuk video non-READY (mis. FAILED yang mau diedit judulnya),
        // fallback tampilkan form kosong yang tetap bisa disimpan via PATCH.
        if (videoRes?.video) {
          setTitle(videoRes.video.title);
          setDescription(videoRes.video.description ?? "");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal memuat data video");
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [videoId]);

  const toggleGenre = (genreId: string) => {
    setSelectedGenreIds((prev) =>
      prev.includes(genreId) ? prev.filter((id) => id !== genreId) : [...prev, genreId]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await api.patch(`/videos/admin/${videoId}`, {
        title,
        description,
        genreIds: selectedGenreIds.length > 0 ? selectedGenreIds : undefined,
      });
      router.push("/admin/videos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan perubahan");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <ProtectedRoute>
        <main className="max-w-xl mx-auto p-6">
          <p className="text-gray-500">Memuat...</p>
        </main>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <main className="max-w-xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Edit Video</h1>

        {error && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 rounded" role="alert">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Judul</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border rounded"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Deskripsi</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              rows={3}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Genre</label>
            <div className="flex flex-wrap gap-2">
              {genres.map((genre) => (
                <button
                  key={genre.id}
                  type="button"
                  onClick={() => toggleGenre(genre.id)}
                  className={`px-3 py-1 rounded-full border text-sm ${
                    selectedGenreIds.includes(genre.id)
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300"
                  }`}
                >
                  {genre.name}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Kosongkan pilihan genre kalau tidak ingin mengubah genre yang sudah ada.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={isSaving || !title.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
            >
              {isSaving ? "Menyimpan..." : "Simpan"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/admin/videos")}
              className="px-4 py-2 bg-gray-200 rounded"
            >
              Batal
            </button>
          </div>
        </div>
      </main>
    </ProtectedRoute>
  );
}