"use client";

import { useChunkedUpload } from "@/lib/hooks/useChunkedUpload";
import { useState } from "react";

export default function UploadTestPage() {
  const { status, progressPercentage, uploadedChunks, totalChunks, errorMessage, videoId, startUpload } =
    useChunkedUpload();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("Test Upload");

  const handleUpload = () => {
    if (!file) return;
    startUpload(file, { title });
  };

  return (
    <div style={{ padding: 24 }}>
      <h1>Test useChunkedUpload</h1>

      <input
        type="file"
        accept="video/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      <br /><br />

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Judul video"
      />

      <br /><br />

      <button onClick={handleUpload} disabled={!file || status === "uploading"}>
        Mulai Upload
      </button>

      <div style={{ marginTop: 16 }}>
        <p>Status: {status}</p>
        {totalChunks > 0 && (
          <p>Progress: {uploadedChunks}/{totalChunks} chunk ({progressPercentage}%)</p>
        )}
        {errorMessage && <p style={{ color: "red" }}>{errorMessage}</p>}
        {videoId && <p style={{ color: "green" }}>✅ Video ID: {videoId}</p>}
      </div>
    </div>
  );
}