"use client";

import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function RegisterForm() {
  const router = useRouter();
  const { register } = useAuth();

  const [formData, setFormData] = useState({ email: "", password: "", name: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Validasi client-side
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.email) {
      newErrors.email = "Email wajib diisi";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Format email tidak valid";
    }

    if (!formData.password) {
      newErrors.password = "Password wajib diisi";
    } else if (formData.password.length < 8) {
      newErrors.password = "Password minimal 8 karakter";
    }

    if (formData.name && formData.name.length < 1) {
      newErrors.name = "Nama tidak boleh kosong kalau diisi";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError("");

    if (!validate()) return;

    setIsLoading(true);
    try {
      await register(formData.email, formData.password, formData.name || undefined);
      // Registrasi sukses, redirect ke login
      router.push("/login");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registrasi gagal";
      setServerError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow">
      <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">Daftar Akun</h1>

      {serverError && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Nama (opsional) */}
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-600">
            Nama (opsional)
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 border text-gray-600 border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Nama lengkap Anda"
          />
          {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1 text-gray-600">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full px-3 py-2 border text-gray-600 border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="email@example.com"
            autoComplete="email"
          />
          {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
        </div>

        {/* Password */}
        <div>
          <label className="block text-sm font-medium mb-1 text-gray-600">
            Password (min 8 karakter)
          </label>
          <input
            type="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            className="w-full px-3 py-2 border text-gray-600 border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Masukkan Password"
            autoComplete="current-password"
          />
          {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password}</p>}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          {isLoading ? "Mendaftar..." : "Daftar"}
        </button>
      </form>

      {/* Link ke login */}
      <p className="mt-4 text-center text-sm text-gray-600">
        Sudah punya akun?{" "}
        <Link href="/login" className="text-blue-600 hover:underline">
          Masuk di sini
        </Link>
      </p>
    </div>
  );
}