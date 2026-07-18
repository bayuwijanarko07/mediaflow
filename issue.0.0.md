# Issue Tracker — Sistem Auth (Bun + Elysia + Prisma + PostgreSQL + Next)

Pemetaan pekerjaan dalam bentuk issue siap pakai (bisa langsung copy ke GitHub/GitLab/Linear).
Dikelompokkan per epic, dengan urutan pengerjaan yang disarankan.

---

## Epic 1: Monorepo & Infrastructure Setup

### #1 — Setup struktur monorepo dengan Bun workspaces
**Label:** `setup`, `priority:high`
**Deskripsi:**
Inisialisasi monorepo dengan Bun workspaces untuk `apps/*` dan `packages/*`.

**Acceptance Criteria:**
- [x] Root `package.json` dengan `workspaces: ["apps/*", "packages/*"]`
- [x] `bunfig.toml` dikonfigurasi
- [x] Folder `apps/api`, `apps/web`, `packages/database`, `packages/shared-types` dibuat
- [x] `bun install` berhasil dari root tanpa error
- [x] `.gitignore` mencakup `node_modules`, `.env`, `dist`, `.turbo` (jika dipakai nanti)

---

### #2 — Setup PostgreSQL & environment variables
**Label:** `setup`, `infra`
**Deskripsi:**
Siapkan database PostgreSQL (lokal via Docker) dan konvensi env var untuk semua service.

**Acceptance Criteria:**
- [x] `docker-compose.yml` dengan service `postgres`
- [x] `.env.example` di root dan tiap app (`DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN`)
- [x] Koneksi dari `apps/api` ke Postgres berhasil di-test manual

---

### #3 — Setup package `packages/database` (Prisma)
**Label:** `setup`, `database`
**Deskripsi:**
Buat package terpisah untuk schema Prisma agar bisa dipakai bersama oleh service lain di masa depan.

**Acceptance Criteria:**
- [x] `schema.prisma` berisi model `User` dan `RefreshToken`
- [x] `bunx prisma migrate dev` berhasil generate migrasi awal
- [x] Export Prisma Client singleton (`export const prisma = new PrismaClient()`) dengan pola untuk cegah multiple instance saat hot-reload
- [x] Package `database` bisa di-import dari `apps/api` via workspace alias

---

## Epic 2: Backend Auth Core (`apps/api`)

### #4 — Setup Elysia app dasar + plugin CORS/cookie
**Label:** `backend`, `priority:high`
**Deskripsi:**
Inisialisasi Elysia server dengan plugin dasar yang dibutuhkan seluruh route.

**Acceptance Criteria:**
- [x] `src/index.ts` menjalankan server Elysia di port dari env
- [x] Plugin `@elysiajs/cors` terpasang dengan `credentials: true` dan origin whitelist
- [x] Plugin `@elysiajs/cookie` terpasang
- [x] Endpoint health check `GET /health` mengembalikan 200

---

### #5 — Implementasi hashing password (argon2 via Bun.password)
**Label:** `backend`, `security`
**Deskripsi:**
Buat utilitas hash & verify password memakai `Bun.password` dengan algoritma argon2id.

**Acceptance Criteria:**
- [x] Fungsi `hashPassword(password)` dan `verifyPassword(password, hash)`
- [x] Unit test: password ter-hash tidak sama dengan plaintext, verify berhasil untuk kombinasi benar & gagal untuk salah

---

### #6 — Endpoint POST /auth/register
**Label:** `backend`, `feature`
**Deskripsi:**
Registrasi user baru dengan validasi email unik dan password policy.

**Acceptance Criteria:**
- [x] Validasi body: email format valid, password minimal 8 karakter
- [x] Return 409 jika email sudah terdaftar   
- [x] Password di-hash sebelum disimpan
- [x] Return 201 dengan data user (tanpa passwordHash) saat sukses
- [x] Test: register sukses, register email duplikat, register password lemah

---

### #7 — Endpoint POST /auth/login
**Label:** `backend`, `feature`, `priority:high`
**Deskripsi:**
Login user, terbitkan access token (JWT, 15 menit) dan refresh token (cookie httpOnly, 7 hari).

**Acceptance Criteria:**
- [x] Return 401 untuk email tidak ditemukan atau password salah (pesan generik, tidak bocorkan mana yang salah)
- [x] Refresh token disimpan di tabel `refresh_tokens` dengan `expiresAt`
- [x] Cookie refresh token: `httpOnly`, `secure`, `sameSite: strict`
- [x] Response body berisi `accessToken` + data user minimal
- [x] Test: login sukses, login gagal (email salah, password salah)

---

### #8 — Endpoint POST /auth/refresh
**Label:** `backend`, `feature`, `priority:high`
**Deskripsi:**
Tukar refresh token valid (dari cookie) menjadi access token baru, dengan token rotation.

**Acceptance Criteria:**
- [x] Baca refresh token dari cookie, validasi terhadap tabel `refresh_tokens` (belum revoked, belum expired)
- [x] Terbitkan access token baru
- [x] Rotasi: revoke refresh token lama, buat refresh token baru, update cookie
- [x] Return 401 jika refresh token invalid/expired/revoked
- [x] Test: refresh sukses, refresh dengan token expired, refresh dengan token yang sudah direvoke

---

### #9 — Endpoint POST /auth/logout
**Label:** `backend`, `feature`
**Deskripsi:**
Logout: revoke refresh token di database dan hapus cookie di client.

**Acceptance Criteria:**
- [x] Refresh token terkait di-set `revoked: true`
- [x] Cookie refresh token dihapus (`maxAge: 0` atau clear)
- [x] Return 200 meski token sudah tidak valid (idempotent)

---

### #10 — Middleware `requireAuth` untuk proteksi route
**Label:** `backend`, `security`
**Deskripsi:**
Middleware yang memvalidasi access token JWT dari header `Authorization`.

**Acceptance Criteria:**
- [x] Return 401 jika header tidak ada / format salah / token invalid / token expired
- [x] Inject `userId` ke context jika valid
- [x] Bisa dipasang sebagai `.use()` di route mana pun secara reusable

---

### #11 — Endpoint GET /auth/me (protected)
**Label:** `backend`, `feature`
**Deskripsi:**
Ambil data profil user yang sedang login berdasarkan access token.

**Acceptance Criteria:**
- [x] Route memakai middleware `requireAuth`
- [x] Return data user (tanpa passwordHash)
- [x] Return 401 jika tidak ada/invalid token

---

### #12 — Rate limiting endpoint login & register
**Label:** `backend`, `security`, `priority:medium`
**Deskripsi:**
Cegah brute-force dengan pembatasan jumlah request per IP/email.

**Acceptance Criteria:**
- [x] Limit request pada `/auth/login` dan `/auth/register` (mis. 5 request/menit per IP)
- [x] Return 429 saat limit terlampaui
- [x] Konfigurasi limit via env var

---

### #13 — Endpoint logout-semua-device
**Label:** `backend`, `feature`, `priority:low`
**Deskripsi:**
Revoke seluruh refresh token milik user (berguna saat curiga akun diretas).

**Acceptance Criteria:**
- [x] Endpoint protected `POST /auth/logout-all`
- [x] Semua `refresh_tokens` milik `userId` di-set `revoked: true`

---

## Epic 3: Frontend Auth (`apps/web`)

### #14 — Setup Vite + Next project di `apps/web`
**Label:** `frontend`, `setup`
**Deskripsi:**
Inisialisasi aplikasi Next dengan Vite, terhubung ke workspace root.

**Acceptance Criteria:**
- [x] `bun run dev` menjalankan dev server tanpa error
- [x] Konfigurasi proxy/base URL API dari env (`VITE_API_URL`)

---

### #15 — AuthContext + provider (state accessToken, user)
**Label:** `frontend`, `feature`, `priority:high`
**Deskripsi:**
Context global untuk menyimpan status login, accessToken (di memory, bukan localStorage), dan data user.

**Acceptance Criteria:**
- [x] `AuthProvider` membungkus root app
- [x] State: `user`, `accessToken`, `isLoading`, `isAuthenticated`
- [x] Fungsi `login()`, `logout()`, `refreshSession()` tersedia via hook `useAuth()`

---

### #16 — API client dengan auto-refresh saat 401
**Label:** `frontend`, `feature`, `priority:high`
**Deskripsi:**
Wrapper fetch yang otomatis memanggil `/auth/refresh` ketika access token expired, lalu retry request asli.

**Acceptance Criteria:**
- [x] Semua request menyertakan `credentials: "include"`
- [x] Saat response 401, coba refresh sekali, lalu retry originalRequest
- [x] Jika refresh juga gagal → logout otomatis + redirect ke halaman login

---

### #17 — Halaman & form Register
**Label:** `frontend`, `feature`
**Deskripsi:**
Form registrasi dengan validasi client-side dan penanganan error dari API.

**Acceptance Criteria:**
- [x] Validasi email & password (min 8 karakter) sebelum submit
- [x] Tampilkan pesan error dari API (mis. email sudah terdaftar)
- [x] Redirect ke login setelah sukses

---

### #18 — Halaman & form Login
**Label:** `frontend`, `feature`, `priority:high`
**Deskripsi:**
Form login yang memanggil `AuthContext.login()`.

**Acceptance Criteria:**
- [x] Validasi input dasar
- [x] Tampilkan error saat kredensial salah
- [x] Redirect ke dashboard/halaman utama setelah sukses

---

### #19 — Protected Route wrapper
**Label:** `frontend`, `feature`
**Deskripsi:**
Komponen/HOC yang redirect ke `/login` jika user belum terautentikasi.

**Acceptance Criteria:**
- [x] Cek `isAuthenticated` dari `useAuth()`
- [x] Tampilkan loading state saat masih memverifikasi sesi (mis. saat refresh page)
- [x] Redirect ke `/login` jika tidak terautentikasi, simpan intended URL untuk redirect balik

---

### #20 — Restore sesi saat reload halaman
**Label:** `frontend`, `feature`, `priority:medium`
**Deskripsi:**
Saat aplikasi pertama kali dimuat, coba panggil `/auth/refresh` untuk memulihkan sesi dari cookie tanpa perlu login ulang.

**Acceptance Criteria:**
- [ ] `AuthProvider` memanggil refresh saat mount
- [ ] Jika gagal, anggap user belum login (tanpa error visual yang mengganggu)

---

### #21 — Tombol & alur Logout
**Label:** `frontend`, `feature`
**Deskripsi:**
UI logout yang memanggil endpoint logout dan membersihkan state lokal.

**Acceptance Criteria:**
- [ ] Memanggil `POST /auth/logout`
- [ ] Clear `user` & `accessToken` dari state
- [ ] Redirect ke halaman login

---

## Epic 4: Hardening & Nice-to-have (Opsional, backlog)

### #22 — Email verification setelah register
**Label:** `feature`, `priority:low`

### #23 — Forgot password / reset password flow
**Label:** `feature`, `priority:low`

### #24 — Two-Factor Authentication (2FA/TOTP)
**Label:** `feature`, `priority:low`

### #25 — Audit log aktivitas login (IP, device, waktu)
**Label:** `feature`, `security`, `priority:low`

### #26 — CI pipeline: lint, typecheck, test untuk semua workspace
**Label:** `infra`, `priority:medium`

---

## Urutan Pengerjaan (Milestone)

| Milestone | Issue |
|---|---|
| **M1 — Foundation** | #1, #2, #3 |
| **M2 — Backend Core** | #4, #5, #6, #7, #8, #9, #10, #11 |
| **M3 — Backend Hardening** | #12, #13 |
| **M4 — Frontend Core** | #14, #15, #16, #17, #18, #19, #20, #21 |
| **M5 — Backlog / Enhancement** | #22–#26 |