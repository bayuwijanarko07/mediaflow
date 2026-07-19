import { describe, expect, test, afterEach } from "bun:test";
import {
  getStoragePath,
  saveFile,
  readFile,
  pathExists,
  deleteFile,
  deleteDirectory,
  listFiles,
  getFileSize,
} from "./index";

const TEST_UPLOAD_ID = "unit-test-upload";

describe("Storage helper", () => {
  afterEach(async () => {
    // Cleanup setelah tiap test, supaya test tidak saling mempengaruhi
    await deleteDirectory(getStoragePath("uploads-temp", TEST_UPLOAD_ID));
  });

  test("getStoragePath menghasilkan path yang benar per kategori", () => {
    const uploadsPath = getStoragePath("uploads-temp", "abc");
    const rawPath = getStoragePath("raw-temp", "abc.mp4");
    const hlsPath = getStoragePath("hls", "video-id", "master.m3u8");

    expect(uploadsPath).toContain("uploads-temp");
    expect(rawPath).toContain("raw-temp");
    expect(hlsPath).toContain("hls");
  });

  test("saveFile & readFile: simpan lalu baca ulang isinya sama", async () => {
    const path = getStoragePath("uploads-temp", TEST_UPLOAD_ID, "chunk-0");
    const content = "Test content 123";

    await saveFile(path, new TextEncoder().encode(content));

    const file = readFile(path);
    const readContent = await file.text();

    expect(readContent).toBe(content);
  });

  test("pathExists return true setelah save, false setelah delete", async () => {
    const path = getStoragePath("uploads-temp", TEST_UPLOAD_ID, "chunk-0");

    await saveFile(path, new TextEncoder().encode("data"));
    expect(pathExists(path)).toBe(true);

    await deleteFile(path);
    expect(pathExists(path)).toBe(false);
  });

  test("listFiles return semua file dalam folder", async () => {
    const dir = getStoragePath("uploads-temp", TEST_UPLOAD_ID);

    await saveFile(getStoragePath("uploads-temp", TEST_UPLOAD_ID, "chunk-0"), new TextEncoder().encode("a"));
    await saveFile(getStoragePath("uploads-temp", TEST_UPLOAD_ID, "chunk-1"), new TextEncoder().encode("b"));
    await saveFile(getStoragePath("uploads-temp", TEST_UPLOAD_ID, "chunk-2"), new TextEncoder().encode("c"));

    const files = await listFiles(dir);

    expect(files.length).toBe(3);
    expect(files).toContain("chunk-0");
    expect(files).toContain("chunk-1");
    expect(files).toContain("chunk-2");
  });

  test("listFiles return array kosong untuk folder yang tidak ada", async () => {
    const files = await listFiles(getStoragePath("uploads-temp", "folder-tidak-ada"));
    expect(files).toEqual([]);
  });

  test("getFileSize return ukuran yang benar", async () => {
    const path = getStoragePath("uploads-temp", TEST_UPLOAD_ID, "chunk-0");
    const content = "12345"; // 5 bytes

    await saveFile(path, new TextEncoder().encode(content));
    const size = await getFileSize(path);

    expect(size).toBe(5);
  });

  test("deleteDirectory menghapus seluruh folder beserta isinya", async () => {
    const dir = getStoragePath("uploads-temp", TEST_UPLOAD_ID);

    await saveFile(getStoragePath("uploads-temp", TEST_UPLOAD_ID, "chunk-0"), new TextEncoder().encode("a"));
    await saveFile(getStoragePath("uploads-temp", TEST_UPLOAD_ID, "chunk-1"), new TextEncoder().encode("b"));

    expect(pathExists(dir)).toBe(true);

    await deleteDirectory(dir);

    expect(pathExists(dir)).toBe(false);
  });

  test("deleteFile pada file yang tidak ada tidak melempar error (idempotent)", async () => {
    const path = getStoragePath("uploads-temp", TEST_UPLOAD_ID, "tidak-ada");

    // Tidak boleh throw
    await deleteFile(path);
  });
});