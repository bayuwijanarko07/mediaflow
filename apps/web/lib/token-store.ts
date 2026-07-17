/**
 * Module-level store untuk access token, terpisah dari React state.
 * Ini memungkinkan api-client (plain function, bukan hook) mengakses
 * token terkini tanpa perlu useContext.
 *
 * AuthContext bertanggung jawab mensinkronkan nilai ini setiap kali
 * accessToken berubah (lihat auth.service belum ada langkah 5).
 */

let currentAccessToken: string | null = null;
let logoutHandler: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  currentAccessToken = token;
}

export function getAccessToken(): string | null {
  return currentAccessToken;
}

/**
 * AuthContext daftarkan fungsi logout-nya di sini, supaya api-client
 * bisa memicu logout otomatis tanpa import AuthContext (hindari circular import).
 */
export function registerLogoutHandler(handler: () => void) {
  logoutHandler = handler;
}

export function triggerLogout() {
  logoutHandler?.();
}