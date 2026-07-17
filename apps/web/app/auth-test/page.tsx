"use client";

import { useAuth } from "@/context/AuthContext";
import { useState } from "react";

export default function AuthTestPage() {
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();
  const [email, setEmail] = useState("test@mediaflow.dev");
  const [password, setPassword] = useState("SuperSecret123!");
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setError("");
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    }
  };

  if (isLoading) {
    return <p>Memuat sesi...</p>;
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>Test AuthContext</h1>

      <p>Status: {isAuthenticated ? "✅ Login" : "❌ Belum login"}</p>

      {user && (
        <pre>{JSON.stringify(user, null, 2)}</pre>
      )}

      {!isAuthenticated ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 300 }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Password"
          />
          <button onClick={handleLogin}>Login</button>
          {error && <p style={{ color: "red" }}>{error}</p>}
        </div>
      ) : (
        <button onClick={logout}>Logout</button>
      )}
    </div>
  );
}