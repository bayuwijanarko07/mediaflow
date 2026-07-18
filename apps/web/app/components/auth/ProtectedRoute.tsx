"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Tunggu sampai proses cek sesi awal (refreshSession di AuthProvider)
    // selesai dulu, supaya tidak salah redirect saat status masih "unknown"
    if (isLoading) return;

    if (!isAuthenticated) {
      // Simpan URL yang dituju supaya bisa balik ke sana setelah login
      const redirectParam = encodeURIComponent(pathname);
      router.replace(`/login?redirect=${redirectParam}`);
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  // Tampilkan loading selama status auth masih diverifikasi,
  // ATAU selama proses redirect ke /login sedang berjalan (hindari flash konten protected)
  if (isLoading || !isAuthenticated) {
    return <ProtectedRouteLoading />;
  }

  return <>{children}</>;
}

function ProtectedRouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600">Memuat...</p>
      </div>
    </div>
  );
}