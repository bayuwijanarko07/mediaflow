"use client";

import { useState, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api-client";
import type {
  InitUploadResponse,
  ChunkUploadResponse,
  UploadStatusResponse,
  CompleteUploadResponse,
} from "@mediaflow/shared-types";
import {
  persistUploadInfo,
  clearPersistedUploadInfo,
  getPersistedUploadInfo,
  type PersistedUploadInfo,
} from "./uploadPersistence";

const MAX_RETRIES_PER_CHUNK = 3;
const MAX_PARALLEL_UPLOADS = 3;

export type UploadStatus =
  | "idle"
  | "initializing"
  | "uploading"
  | "completing"
  | "success"
  | "error";

interface UseChunkedUploadState {
  status: UploadStatus;
  progressPercentage: number;
  uploadedChunks: number;
  totalChunks: number;
  errorMessage: string | null;
  videoId: string | null;
}

interface UploadMetadata {
  title: string;
  description?: string;
  genreIds?: string[];
}

export function useChunkedUpload() {
  const [state, setState] = useState<UseChunkedUploadState>({
    status: "idle",
    progressPercentage: 0,
    uploadedChunks: 0,
    totalChunks: 0,
    errorMessage: null,
    videoId: null,
  });

  // Simpan referensi supaya bisa dipakai untuk resume manual kalau perlu
  const uploadIdRef = useRef<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const chunkSizeRef = useRef<number>(0);

  const reset = useCallback(() => {
    setState({
      status: "idle",
      progressPercentage: 0,
      uploadedChunks: 0,
      totalChunks: 0,
      errorMessage: null,
      videoId: null,
    });
    uploadIdRef.current = null;
    fileRef.current = null;
  }, []);

  /**
   * Kirim 1 chunk dengan retry otomatis kalau gagal.
   */
  const uploadChunkWithRetry = useCallback(
    async (
      uploadId: string,
      chunkIndex: number,
      chunkBlob: Blob,
      attempt = 1
    ): Promise<void> => {
      try {
        const res = await apiFetch(
          `/videos/upload/${uploadId}/chunk/${chunkIndex}`,
          {
            method: "PUT",
            body: chunkBlob,
            headers: { "Content-Type": "application/octet-stream" },
          }
        );

        if (!res.ok) {
          throw new Error(`Chunk ${chunkIndex} gagal dengan status ${res.status}`);
        }
      } catch (error) {
        if (attempt < MAX_RETRIES_PER_CHUNK) {
          // Retry dengan sedikit delay, exponential backoff sederhana
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
          return uploadChunkWithRetry(uploadId, chunkIndex, chunkBlob, attempt + 1);
        }
        throw error;
      }
    },
    []
  );

  /**
   * Upload beberapa chunk secara paralel terbatas (bukan semua sekaligus,
   * supaya tidak membanjiri server, dan bukan sekuensial murni supaya
   * throughput tetap baik).
   */
  const uploadChunksInBatches = useCallback(
    async (
      uploadId: string,
      file: File,
      chunkSize: number,
      totalChunks: number,
      chunksToUpload: number[]
    ) => {
      let completedCount = totalChunks - chunksToUpload.length;

      for (let i = 0; i < chunksToUpload.length; i += MAX_PARALLEL_UPLOADS) {
        const batch = chunksToUpload.slice(i, i + MAX_PARALLEL_UPLOADS);

        await Promise.all(
          batch.map(async (chunkIndex) => {
            const start = chunkIndex * chunkSize;
            const end = Math.min(start + chunkSize, file.size);
            const chunkBlob = file.slice(start, end);

            await uploadChunkWithRetry(uploadId, chunkIndex, chunkBlob);

            completedCount++;
            setState((prev) => ({
              ...prev,
              uploadedChunks: completedCount,
              progressPercentage: Math.round((completedCount / totalChunks) * 100),
            }));
          })
        );
      }
    },
    [uploadChunkWithRetry]
  );

  /**
   * Mulai upload dari awal (file baru).
   */
  const startUpload = useCallback(
    async (file: File, metadata: UploadMetadata) => {
      reset();
      fileRef.current = file;

      try {
        setState((prev) => ({ ...prev, status: "initializing" }));

        const initRes = await apiFetch("/videos/upload/init", {
          method: "POST",
          body: JSON.stringify({
            fileName: file.name,
            fileSizeBytes: file.size,
            title: metadata.title,
            description: metadata.description,
            genreIds: metadata.genreIds,
          }),
        });

        if (!initRes.ok) {
          const err = await initRes.json().catch(() => null);
          throw new Error(err?.message ?? `Gagal memulai sesi upload (status ${initRes.status})`);
        }

        const initData: InitUploadResponse = await initRes.json();
        uploadIdRef.current = initData.uploadId;
        chunkSizeRef.current = initData.chunkSize;

        persistUploadInfo({
          uploadId: initData.uploadId,
          fileName: file.name,
          fileSize: file.size,
          chunkSize: initData.chunkSize,
          totalChunks: initData.totalChunks,
          savedAt: new Date().toISOString(),
        });

        setState((prev) => ({
          ...prev,
          status: "uploading",
          totalChunks: initData.totalChunks,
        }));

        const allChunkIndexes = Array.from(
          { length: initData.totalChunks },
          (_, i) => i
        );

        await uploadChunksInBatches(
          initData.uploadId,
          file,
          initData.chunkSize,
          initData.totalChunks,
          allChunkIndexes
        );

        // Semua chunk terkirim, panggil complete
        setState((prev) => ({ ...prev, status: "completing" }));

        const completeRes = await apiFetch(
          `/videos/upload/${initData.uploadId}/complete`,
          { method: "POST" }
        );

        if (!completeRes.ok) {
          const err = await completeRes.json().catch(() => null);
          throw new Error(err?.message ?? `Gagal menyelesaikan upload (status ${completeRes.status})`);
        }

        const completeData: CompleteUploadResponse = await completeRes.json();

        clearPersistedUploadInfo(file.name);

        setState((prev) => ({
          ...prev,
          status: "success",
          videoId: completeData.video.id,
          progressPercentage: 100,
        }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          status: "error",
          errorMessage: error instanceof Error ? error.message : "Upload gagal",
        }));
      }
    },
    [reset, uploadChunksInBatches]
  );

  /**
   * Lanjutkan upload yang terputus, pakai uploadId yang sudah ada.
   * Cek dulu chunk mana saja yang sudah diterima server (lewat endpoint
   * status), lalu cuma kirim chunk yang BELUM ada.
   */
  const resumeUpload = useCallback(
    async (
      uploadId: string,
      file: File,
      chunkSize?: number,
      totalChunks?: number
    ) => {
      uploadIdRef.current = uploadId;
      fileRef.current = file;

      try {
        setState((prev) => ({ ...prev, status: "uploading" }));

        const statusRes = await apiFetch(`/videos/upload/${uploadId}/status`);

        if (!statusRes.ok) {
          const err = await statusRes.json().catch(() => null);
          throw new Error(err?.message ?? "Sesi upload tidak ditemukan, mulai ulang dari awal");
        }

        const statusData: UploadStatusResponse = await statusRes.json();
        const storedInfo = getPersistedUploadInfo(file.name);

        const effectiveTotalChunks =
          totalChunks ?? statusData.totalChunks ?? storedInfo?.totalChunks;
        const effectiveChunkSize =
          chunkSize ??
          storedInfo?.chunkSize ??
          Math.ceil(file.size / effectiveTotalChunks);

        chunkSizeRef.current = effectiveChunkSize;

        persistUploadInfo({
          uploadId,
          fileName: file.name,
          fileSize: file.size,
          chunkSize: effectiveChunkSize,
          totalChunks: effectiveTotalChunks,
          savedAt: new Date().toISOString(),
        });

        const missingChunks = Array.from(
          { length: effectiveTotalChunks },
          (_, i) => i
        ).filter((index) => !statusData.receivedChunks.includes(index));

        setState((prev) => ({
          ...prev,
          totalChunks: effectiveTotalChunks,
          uploadedChunks: statusData.receivedChunks.length,
          progressPercentage: Math.round(
            (statusData.receivedChunks.length / effectiveTotalChunks) * 100
          ),
        }));

        if (missingChunks.length > 0) {
          await uploadChunksInBatches(
            uploadId,
            file,
            effectiveChunkSize,
            effectiveTotalChunks,
            missingChunks
          );
        }

        setState((prev) => ({ ...prev, status: "completing" }));

        const completeRes = await apiFetch(`/videos/upload/${uploadId}/complete`, {
          method: "POST",
        });

        if (!completeRes.ok) {
          const err = await completeRes.json().catch(() => null);
          throw new Error(err?.message ?? `Gagal menyelesaikan upload (status ${completeRes.status})`);
        }

        const completeData: CompleteUploadResponse = await completeRes.json();

        clearPersistedUploadInfo(file.name);

        setState((prev) => ({
          ...prev,
          status: "success",
          videoId: completeData.video.id,
          progressPercentage: 100,
        }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          status: "error",
          errorMessage: error instanceof Error ? error.message : "Resume upload gagal",
        }));
      }
    },
    [uploadChunksInBatches]
  );

  return {
    ...state,
    startUpload,
    resumeUpload,
    reset,
    getPendingUploadInfo: getPersistedUploadInfo,
    currentUploadId: uploadIdRef.current,
  };
}