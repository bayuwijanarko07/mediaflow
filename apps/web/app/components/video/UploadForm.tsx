"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useChunkedUpload } from "@/lib/hooks/useChunkedUpload";
import { apiFetch } from "@/lib/api-client";
import type { Genre } from "@mediaflow/shared-types";

const ACCEPTED_FORMATS = ["video/mp4", "video/quicktime", "video/x-matroska"];
const ACCEPTED_EXTENSIONS = [".mp4", ".mov", ".mkv"];
const MAX_FILE_SIZE_GB = Number(process.env.NEXT_PUBLIC_MAX_FILE_SIZE_GB ?? 10);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_GB * 1024 * 1024 * 1024;

export function UploadForm() {
  const router = useRouter();
  const {
    status,
    progressPercentage,
    uploadedChunks,
    totalChunks,
    errorMessage,
    videoId,
    startUpload,
    resumeUpload,
    getPendingUploadInfo,
  } = useChunkedUpload();

  const [genres, setGenres] = useState<Genre[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [fileValidationError, setFileValidationError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedGenreIds, setSelectedGenreIds] = useState<string[]>([]);
  const [pendingInfo, setPendingInfo] = useState<ReturnType<typeof getPendingUploadInfo>>(null);

  // Ambil daftar genre saat komponen mount
  useEffect(() => {
    apiFetch("/genres")
      .then((res) => res.json())
      .then((data) => setGenres(data.genres ?? []))
      .catch(() => setGenres([]));
  }, []);

  // Redirect ke halaman detail video setelah upload sukses
  useEffect(() => {
    if (status === "success" && videoId) {
      const timer = setTimeout(() => {
        router.push(`/admin/videos/${videoId}`);
      }, 1500); // beri jeda sebentar supaya user lihat pesan sukses dulu
      return () => clearTimeout(timer);
    }
  }, [status, videoId, router]);

  const validateFile = useCallback((selectedFile: File): string | null => {
    const extension = "." + selectedFile.name.split(".").pop()?.toLowerCase();

    if (
      !ACCEPTED_FORMATS.includes(selectedFile.type) &&
      !ACCEPTED_EXTENSIONS.includes(extension)
    ) {
      return `Format file tidak didukung. Gunakan: ${ACCEPTED_EXTENSIONS.join(", ")}`;
    }

    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      return `Ukuran file melebihi batas maksimal ${MAX_FILE_SIZE_GB}GB`;
    }

    if (selectedFile.size === 0) {
      return "File kosong tidak valid";
    }

    return null;
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] ?? null;

    if (!selectedFile) {
      setFile(null);
      setFileValidationError(null);
      setPendingInfo(null);
      return;
    }

    const validationError = validateFile(selectedFile);
    setFileValidationError(validationError);
    setFile(validationError ? null : selectedFile);

    if (!validationError) {
      const persisted = getPendingUploadInfo(selectedFile.name);
      const isMatchingFile = persisted && persisted.fileSize === selectedFile.size;
      setPendingInfo(isMatchingFile ? persisted : null);
    }
  };

  const toggleGenre = (genreId: string) => {
    setSelectedGenreIds((prev) =>
      prev.includes(genreId) ? prev.filter((id) => id !== genreId) : [...prev, genreId]
    );
  };

  const handleStartFresh = () => {
    if (!file || !title.trim()) return;
    startUpload(file, { title, description, genreIds: selectedGenreIds } as any);
  };

  const handleResume = () => {
    if (!file || !pendingInfo) return;
    resumeUpload(pendingInfo.uploadId, file);
  };

  const isFormValid = file && title.trim().length > 0 && !fileValidationError;
  const isBusy = status === "initializing" || status === "uploading" || status === "completing";

  return (
    <div className="max-w-xl mx-auto p-6 bg-white rounded-lg shadow">
      <h1 className="text-2xl font-bold mb-6">Upload Video Baru</h1>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">File Video</label>
          <input
            type="file"
            accept=".mp4,.mov,.mkv,video/*"
            onChange={handleFileSelect}
            disabled={isBusy}
            className="w-full"
          />
          {fileValidationError && (
            <p className="text-red-500 text-sm mt-1">{fileValidationError}</p>
          )}
          {file && !fileValidationError && (
            <p className="text-gray-500 text-sm mt-1">
              {file.name} ({(file.size / (1024 * 1024)).toFixed(1)} MB)
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Judul</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isBusy}
            className="w-full px-3 py-2 border rounded"
            placeholder="Judul video"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Deskripsi (opsional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isBusy}
            className="w-full px-3 py-2 border rounded"
            rows={3}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Genre</label>
          <div className="flex flex-wrap gap-2">
            {genres.map((genre) => (
              <label
                key={genre.id}
                className={`px-3 py-1 rounded-full border cursor-pointer text-sm ${
                  selectedGenreIds.includes(genre.id)
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-700 border-gray-300"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedGenreIds.includes(genre.id)}
                  onChange={() => toggleGenre(genre.id)}
                  disabled={isBusy}
                  className="hidden"
                />
                {genre.name}
              </label>
            ))}
            {genres.length === 0 && (
              <p className="text-gray-400 text-sm">Belum ada genre tersedia</p>
            )}
          </div>
        </div>

        {pendingInfo && status === "idle" && (
          <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
            <p className="text-sm mb-2">
              Ditemukan upload sebelumnya untuk file ini yang belum selesai (
              {pendingInfo.totalChunks} chunk total).
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleResume}
                className="px-3 py-1 bg-yellow-600 text-white rounded text-sm"
              >
                Lanjutkan Upload
              </button>
              <button
                onClick={handleStartFresh}
                disabled={!isFormValid}
                className="px-3 py-1 bg-gray-200 rounded text-sm"
              >
                Mulai Ulang dari Awal
              </button>
            </div>
          </div>
        )}

        {!pendingInfo && (
          <button
            onClick={handleStartFresh}
            disabled={!isFormValid || isBusy}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {isBusy ? "Mengupload..." : "Mulai Upload"}
          </button>
        )}

        {(isBusy || status === "success") && (
          <div className="mt-4">
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-blue-600 h-3 transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {status === "initializing" && "Memulai sesi upload..."}
              {status === "uploading" &&
                `Mengupload chunk ${uploadedChunks}/${totalChunks} (${progressPercentage}%)`}
              {status === "completing" && "Menyelesaikan upload, menggabungkan file..."}
              {status === "success" && `✅ Upload selesai! Mengalihkan ke halaman video...`}
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="bg-red-50 border border-red-200 rounded p-3">
            <p className="text-red-700 text-sm">{errorMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
}