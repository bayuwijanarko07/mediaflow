"use client";

import { ProtectedRoute } from "@/app/components/auth/ProtectedRoute";
import { LogoutButton } from "@/app/components/auth/LogoutButton";
import { useAuth } from "@/context/AuthContext";

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}

function DashboardContent() {
  const { user } = useAuth();

  return (
    <main style={{ padding: 24 }}>
      <h1>Dashboard (Protected)</h1>
      <p>Selamat datang, {user?.name ?? user?.email}!</p>
      <LogoutButton />
    </main>
  );
}