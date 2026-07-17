"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  setAccessToken as setTokenStoreValue,
  registerLogoutHandler,
} from "@/lib/token-store";
import type { AuthUser } from "@mediaflow/shared-types";

import { apiFetch } from "@/lib/api-client";

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// export function AuthProvider({ children }: { children: ReactNode }) {
//   const [user, setUser] = useState<AuthUser | null>(null);
//   const [accessToken, setAccessToken] = useState<string | null>(null);
//   const [isLoading, setIsLoading] = useState(true);

//   const login = useCallback(async (email: string, password: string) => {
//     const res = await fetch(`${API_URL}/auth/login`, {
//       method: "POST",
//       credentials: "include",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({ email, password }),
//     });

//     if (!res.ok) {
//       const error = await res.json();
//       throw new Error(error.message ?? "Login gagal");
//     }

//     const data = await res.json();
//     setAccessToken(data.accessToken);
//     setUser(data.user);
//   }, []);

//   const register = useCallback(
//     async (email: string, password: string, name?: string) => {
//       const res = await fetch(`${API_URL}/auth/register`, {
//         method: "POST",
//         credentials: "include",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ email, password, name }),
//       });

//       if (!res.ok) {
//         const error = await res.json();
//         throw new Error(error.message ?? "Registrasi gagal");
//       }
//     },
//     []
//   );

//   const logout = useCallback(async () => {
//     await fetch(`${API_URL}/auth/logout`, {
//       method: "POST",
//       credentials: "include",
//     });
//     setAccessToken(null);
//     setUser(null);
//   }, []);

//   const refreshSession = useCallback(async (): Promise<boolean> => {
//     try {
//       const res = await fetch(`${API_URL}/auth/refresh`, {
//         method: "POST",
//         credentials: "include",
//       });

//       if (!res.ok) {
//         setAccessToken(null);
//         setUser(null);
//         return false;
//       }

//       const data = await res.json();
//       setAccessToken(data.accessToken);
//       setUser(data.user);
//       return true;
//     } catch {
//       setAccessToken(null);
//       setUser(null);
//       return false;
//     }
//   }, []);

//   // Restore sesi saat pertama kali app dimuat (detail lengkap di Issue #20)
//   useEffect(() => {
//     refreshSession().finally(() => setIsLoading(false));
//   }, [refreshSession]);

//   const value: AuthContextValue = {
//     user,
//     accessToken,
//     isLoading,
//     isAuthenticated: Boolean(user && accessToken),
//     login,
//     register,
//     logout,
//     refreshSession,
//   };

//   return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
// }

// export function useAuth() {
//   const context = useContext(AuthContext);

//   if (context === undefined) {
//     throw new Error("useAuth harus dipakai di dalam AuthProvider");
//   }

//   return context;
// }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Wrapper supaya SETIAP kali accessToken di-set di React state,
  // token store (dipakai api-client) juga otomatis ikut sinkron.
  const setAccessToken = useCallback((token: string | null) => {
    setAccessTokenState(token);
    setTokenStoreValue(token);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      skipAuthRetry: true, // penting: login tidak boleh trigger auto-refresh
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message ?? "Login gagal");
    }

    const data = await res.json();
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, [setAccessToken]);

  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      const res = await apiFetch("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, name }),
        skipAuthRetry: true,
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message ?? "Registrasi gagal");
      }
    },
    []
  );

  const logout = useCallback(async () => {
    await apiFetch("/auth/logout", { method: "POST", skipAuthRetry: true });
    setAccessToken(null);
    setUser(null);
  }, [setAccessToken]);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const res = await apiFetch("/auth/refresh", {
        method: "POST",
        skipAuthRetry: true, // krusial — cegah infinite loop
      });

      if (!res.ok) {
        setAccessToken(null);
        setUser(null);
        return false;
      }

      const data = await res.json();
      setAccessToken(data.accessToken);
      setUser(data.user);
      return true;
    } catch {
      setAccessToken(null);
      setUser(null);
      return false;
    }
  }, [setAccessToken]);

  // Daftarkan logout sebagai handler yang dipanggil api-client
  // saat auto-refresh gagal total (lihat token-store.ts & api-client.ts)
  useEffect(() => {
    registerLogoutHandler(() => {
      setAccessToken(null);
      setUser(null);
    });
  }, [setAccessToken]);

  useEffect(() => {
    refreshSession().finally(() => setIsLoading(false));
  }, [refreshSession]);

  const value = {
    user,
    accessToken,
    isLoading,
    isAuthenticated: Boolean(user && accessToken),
    login,
    register,
    logout,
    refreshSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth harus dipakai di dalam AuthProvider");
  }
  return context;
}