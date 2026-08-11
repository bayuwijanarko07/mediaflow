"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";

interface RequireAdminProps {
  children: ReactNode;
}

/**
 * Varian ProtectedRoute khusus halaman admin (/admin/*).
 *
 * Beda dengan ProtectedRoute biasa (yang cuma cek "sudah login atau
 * belum"), komponen ini juga memvalidasi role === "ADMIN". Ini
 * memperbaiki celah UX di mana member (role USER) yang mengetik URL
 * /admin/* langsung bisa membuka & mengisi form admin, padahal setiap
 * action-nya akan ditolak backend (403 dari requireAdmin) — sekarang
 * mereka langsung diarahkan pergi sebelum sempat melihat form itu.
 *
 * Catatan keamanan: ini murni perbaikan UX/navigasi, BUKAN pengganti
 * proteksi backend. Enforcement sesungguhnya tetap di requireAdmin
 * middleware (apps/api) — guard ini hanya mencegah member "nyasar"
 * ke halaman yang tidak relevan buat mereka.
 */
export function RequireAdmin({ children }: RequireAdminProps) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isAdmin = user?.role === "ADMIN";

  useEffect(() => {
    // Tunggu status auth awal selesai diverifikasi (refreshSession di
    // AuthProvider) sebelum memutuskan redirect — sama seperti
    // ProtectedRoute, supaya tidak salah redirect saat reload halaman.
    if (isLoading) return;

    if (!isAuthenticated) {
      // Belum login sama sekali → alur sama seperti ProtectedRoute:
      // simpan intended URL supaya bisa balik ke sini setelah login,
      // KALAU nanti ternyata dia memang admin.
      const redirectParam = encodeURIComponent(pathname);
      router.replace(`/login?redirect=${redirectParam}`);
      return;
    }

    if (!isAdmin) {
      // Sudah login tapi bukan admin → jangan tampilkan form admin
      // sama sekali, langsung kembalikan ke beranda member.
      router.replace("/");
    }
  }, [isLoading, isAuthenticated, isAdmin, pathname, router]);

  // Tampilkan loading selama status auth/role masih diverifikasi ATAU
  // selama proses redirect (login/beranda) sedang berjalan — hindari
  // flash konten admin ke member sebelum redirect sempat dieksekusi.
  if (isLoading || !isAuthenticated || !isAdmin) {
    return <RequireAdminLoading />;
  }

  return <>{children}</>;
}

function RequireAdminLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-600">Memuat...</p>
      </div>
    </div>
  );
}