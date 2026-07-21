import { getAccessToken, setAccessToken, triggerLogout } from "./token-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

interface ApiFetchOptions extends RequestInit {
  /**
   * Set true untuk endpoint yang TIDAK boleh memicu auto-refresh,
   * contoh: /auth/login, /auth/register, /auth/refresh itu sendiri —
   * mencegah infinite loop kalau refresh-nya sendiri yang gagal dengan 401.
   */
  skipAuthRetry?: boolean;
}

// Dedupe: kalau ada beberapa request 401 bersamaan, hanya 1 refresh
// call yang benar-benar jalan, sisanya menunggu promise yang sama.
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        setAccessToken(null);
        return false;
      }

      const data = await res.json();
      setAccessToken(data.accessToken);
      return true;
    } catch {
      setAccessToken(null);
      return false;
    }
  })();

  const result = await refreshPromise;
  refreshPromise = null; // reset supaya 401 berikutnya bisa trigger refresh baru
  return result;
}

function buildHeaders(options: ApiFetchOptions, token: string | null): HeadersInit {
  const isFormData = options.body instanceof FormData;

  return {
    ...(!isFormData ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
}

/**
 * Fetch wrapper utama. Semua request ke API backend WAJIB lewat sini,
 * bukan fetch() langsung, supaya auto-refresh dan credentials konsisten.
 */
export async function apiFetch(
  path: string,
  options: ApiFetchOptions = {}
): Promise<Response> {
  const { skipAuthRetry, ...restOptions } = options;

  const doFetch = (token: string | null) =>
    fetch(`${API_URL}${path}`, {
      ...restOptions,
      credentials: "include",
      headers: buildHeaders(options, token),
    });

  let response = await doFetch(getAccessToken());

  if (response.status === 401 && !skipAuthRetry) {
    const refreshed = await refreshAccessToken();

    if (refreshed) {
      // retry SEKALI dengan token baru — tidak ada retry kedua
      response = await doFetch(getAccessToken());
    } else {
      triggerLogout();

      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
  }

  return response;
}

/**
 * Helper method supaya pemakaian di komponen lebih ringkas,
 * otomatis parse JSON dan lempar error kalau response tidak ok.
 */
export const api = {
  async get<T>(path: string, options?: ApiFetchOptions): Promise<T> {
    const res = await apiFetch(path, { ...options, method: "GET" });
    return handleJsonResponse<T>(res);
  },

  async post<T>(path: string, body?: unknown, options?: ApiFetchOptions): Promise<T> {
    const res = await apiFetch(path, {
      ...options,
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleJsonResponse<T>(res);
  },

  async patch<T>(path: string, body?: unknown, options?: ApiFetchOptions): Promise<T> {
    const res = await apiFetch(path, {
      ...options,
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleJsonResponse<T>(res);
  },

  async delete<T>(path: string, options?: ApiFetchOptions): Promise<T> {
    const res = await apiFetch(path, { ...options, method: "DELETE" });
    return handleJsonResponse<T>(res);
  },
};

async function handleJsonResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get("content-type");
  const isJson = contentType?.includes("application/json");

  const data = isJson
    ? await res.json().catch(() => null)
    : await res.text().catch(() => null);

  if (!res.ok) {
    const message =
      isJson && data && typeof data === "object" && "message" in data
        ? (data as { message: string }).message
        : typeof data === "string"
          ? data
          : `Request gagal dengan status ${res.status}`;
    throw new Error(message);
  }

  return data as T;
}