"use client";

import { ProtectedRoute } from "@/app/components/auth/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}

function DashboardContent() {
  const { user, logout } = useAuth();

  return (
    <main style={{ padding: 24 }}>
      <h1>Dashboard (Protected)</h1>
      <p>Selamat datang, {user?.name ?? user?.email}!</p>
      <p>Halaman ini hanya bisa diakses kalau sudah login.</p>
      <button onClick={logout}>Logout</button>
    </main>
  );
}