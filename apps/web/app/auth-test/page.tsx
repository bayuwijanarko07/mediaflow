"use client";

import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api-client";
import { useState } from "react";

export default function AuthTestPage() {
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();
  const [meData, setMeData] = useState<unknown>(null);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) =>
    setLog((prev) => [...prev, `${new Date().toLocaleTimeString()} — ${msg}`]);

  const handleFetchMe = async () => {
    addLog("Memanggil GET /auth/me...");
    try {
      const data = await api.get("/auth/me");
      setMeData(data);
      addLog("✅ Berhasil (kemungkinan token masih valid, atau auto-refresh berhasil)");
    } catch (err) {
      addLog(`❌ Gagal: ${err instanceof Error ? err.message : "unknown"}`);
    }
  };

  if (isLoading) return <p>Memuat sesi...</p>;

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Test Auto-Refresh</h1>
      <p>Status: {isAuthenticated ? "✅ Login" : "❌ Belum login"}</p>

      {!isAuthenticated ? (
        <button onClick={() => login("test@mediaflow.dev", "SuperSecret123!")}>
          Login
        </button>
      ) : (
        <>
          <button onClick={handleFetchMe}>Fetch /auth/me</button>
          <button onClick={logout} style={{ marginLeft: 8 }}>
            Logout
          </button>
        </>
      )}

      <div style={{ marginTop: 16 }}>
        <strong>Log aktivitas:</strong>
        <pre style={{ background: "#f0f0f0", padding: 8, fontSize: 12 }}>
          {log.join("\n")}
        </pre>
      </div>

      {meData && <pre>{JSON.stringify(meData, null, 2)}</pre>}
    </div>
  );
}