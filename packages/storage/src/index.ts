import { mkdir, rm, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";

const STORAGE_ROOT = process.env.STORAGE_ROOT;
const UPLOADS_TEMP_DIR = process.env.STORAGE_UPLOADS_TEMP_DIR ?? "uploads-temp";
const RAW_TEMP_DIR = process.env.STORAGE_RAW_TEMP_DIR ?? "raw-temp";
const HLS_DIR = process.env.STORAGE_HLS_DIR ?? "hls";

if (!STORAGE_ROOT) {
  throw new Error(
    "STORAGE_ROOT belum diset di environment variable. Cek file .env."
  );
}

/**
 * Resolve path absolut ke salah satu folder storage utama.
 * Selalu pakai fungsi ini (jangan hardcode path manual di tempat lain)
 * supaya konsisten kalau struktur folder berubah di kemudian hari.
 */
export function getStoragePath(
  category: "uploads-temp" | "raw-temp" | "hls",
  ...segments: string[]
): string {
  const categoryDir =
    category === "uploads-temp"
      ? UPLOADS_TEMP_DIR
      : category === "raw-temp"
        ? RAW_TEMP_DIR
        : HLS_DIR;

  return resolve(join(STORAGE_ROOT!, categoryDir, ...segments));
}

/**
 * Pastikan folder storage utama (uploads-temp, raw-temp, hls) ada.
 * Dipanggil sekali saat startup apps/api dan apps/worker.
 */
export async function ensureStorageDirs(): Promise<void> {
  const dirs = [
    getStoragePath("uploads-temp"),
    getStoragePath("raw-temp"),
    getStoragePath("hls"),
  ];

  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
  }
}

/**
 * Simpan buffer/blob sebagai file di path storage tertentu.
 * Otomatis membuat folder induk kalau belum ada.
 */
export async function saveFile(
  path: string,
  data: ArrayBuffer | Uint8Array | Blob
): Promise<void> {
  const dir = path.substring(0, path.lastIndexOf("\\") !== -1 ? path.lastIndexOf("\\") : path.lastIndexOf("/"));
  await mkdir(dir, { recursive: true });
  await Bun.write(path, data);
}

/**
 * Baca file sebagai Bun.BunFile (bisa di-stream, dicek exists, dsb).
 */
export function readFile(path: string) {
  return Bun.file(path);
}

/**
 * Cek apakah file/folder ada di path tertentu.
 */
export function pathExists(path: string): boolean {
  return existsSync(path);
}

/**
 * Hapus 1 file.
 */
export async function deleteFile(path: string): Promise<void> {
  if (pathExists(path)) {
    await rm(path, { force: true });
  }
}

/**
 * Hapus folder beserta seluruh isinya (dipakai untuk cleanup
 * uploads-temp/{uploadId}/ setelah assembly, atau hapus hls/{videoId}/
 * saat video dihapus admin).
 */
export async function deleteDirectory(path: string): Promise<void> {
  if (pathExists(path)) {
    await rm(path, { recursive: true, force: true });
  }
}

/**
 * List semua file dalam 1 folder (dipakai untuk cek chunk mana saja
 * yang sudah diterima saat resume upload).
 */
export async function listFiles(dirPath: string): Promise<string[]> {
  if (!pathExists(dirPath)) return [];
  return readdir(dirPath);
}

/**
 * Ambil ukuran file dalam bytes.
 */
export async function getFileSize(path: string): Promise<number> {
  const stats = await stat(path);
  return stats.size;
}