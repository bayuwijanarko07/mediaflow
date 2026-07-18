"use client";

import { useAuth } from "@/context/AuthContext";
import { LogoutButton } from "@/app/components/auth/LogoutButton";
import Link from "next/link";

export default function HomePage() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Mediaflow</h1>
      {isAuthenticated ? (
        <>
          <p>Halo, {user?.name ?? user?.email}!</p>
          <LogoutButton />
        </>
      ) : (
        <div>
          <p>Silakan login untuk melanjutkan.</p>
          <Link href="/login">Masuk</Link>
        </div>
      )}
    </main>
  );
}