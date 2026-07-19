"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface LogoutButtonProps {
  className?: string;
  children?: React.ReactNode;
}

export function LogoutButton({ className, children }: LogoutButtonProps) {
  const { logout } = useAuth();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {c
      await logout();
    } catch (error) {
+     console.error("Logout API gagal:", error);
    } finally {
      // redirect selalu jalan, baik logout API sukses maupun gagal --
      // dari sudut pandang user, klik logout harus selalu membawa
      // mereka keluar dari halaman protected
      router.push("/login");
    }
  };

  return (
    <button
      onClick={handleLogout}
      disabled={isLoggingOut}
      className={
        className ??
        "px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400"
      }
    >
      {isLoggingOut ? "Keluar..." : (children ?? "Logout")}
    </button>
  );
}