export interface PersistedUploadInfo {
  uploadId: string;
  fileName: string;
  fileSize: number;
  chunkSize: number;
  totalChunks: number;
  savedAt: string;
}

const STORAGE_KEY_PREFIX = "mediaflow:upload-progress:";

/**
 * Simpan info upload yang sedang berjalan ke sessionStorage (bukan
 * localStorage — sengaja per-tab, karena file object tidak bisa
 * di-serialize; ini cuma metadata untuk membantu resume kalau
 * tab yang sama ter-reload, bukan lintas device/browser).
 */
export function persistUploadInfo(info: PersistedUploadInfo): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(
    `${STORAGE_KEY_PREFIX}${info.fileName}`,
    JSON.stringify(info)
  );
}

export function getPersistedUploadInfo(
  fileName: string
): PersistedUploadInfo | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(`${STORAGE_KEY_PREFIX}${fileName}`);
  return raw ? JSON.parse(raw) : null;
}

export function clearPersistedUploadInfo(fileName: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(`${STORAGE_KEY_PREFIX}${fileName}`);
}