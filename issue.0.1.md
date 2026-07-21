# Issue Tracker — Mediaflow (Auth + Streaming Module)

Pemetaan pekerjaan dalam bentuk issue siap pakai (bisa langsung copy ke GitHub/GitLab/Linear).
Dikelompokkan per epic, dengan urutan pengerjaan yang disarankan.

**Konteks streaming module:** target skala 10-20 pengguna concurrent, deployment di 1 PC/server lokal (bukan cloud), akses dari luar lewat VPN, storage pakai disk lokal (bukan S3/cloud), raw file dihapus otomatis setelah transcoding sukses. Lihat `PRD-Mediaflow-Streaming.md` untuk detail lengkap.

---

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
- [x] `AuthProvider` memanggil refresh saat mount
- [x] Jika gagal, anggap user belum login (tanpa error visual yang mengganggu)

---

### #21 — Tombol & alur Logout
**Label:** `frontend`, `feature`
**Deskripsi:**
UI logout yang memanggil endpoint logout dan membersihkan state lokal.

**Acceptance Criteria:**
- [x] Memanggil `POST /auth/logout`
- [x] Clear `user` & `accessToken` dari state
- [x] Redirect ke halaman login

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

## Epic 5: Streaming Infrastructure Setup

### #27 — Setup Redis via Podman + koneksi dari `apps/api`
**Label:** `setup`, `infra`, `priority:high`
**Deskripsi:**
Tambahkan service Redis ke `compose.yml`, dan buat koneksi Redis client di `apps/api` untuk dipakai job queue nanti.

**Acceptance Criteria:**
- [x] Service `redis` ditambahkan ke `compose.yml`, `podman compose up -d` berhasil
- [x] `apps/api` bisa konek ke Redis (test manual: set/get key sederhana)
- [x] `REDIS_URL` ditambahkan ke `.env.example` dan `.env`

---

### #28 — Setup struktur folder storage lokal
**Label:** `setup`, `infra`, `priority:high`
**Deskripsi:**
Buat struktur folder di disk lokal untuk `uploads-temp/`, `raw-temp/`, `hls/` sesuai desain di PRD, dan buat helper module untuk baca/tulis/hapus file.

**Acceptance Criteria:**
- [x] Folder `mediaflow-storage/{uploads-temp,raw-temp,hls}` dibuat, path dikonfigurasi via `STORAGE_ROOT` di `.env`
- [x] Helper `storage.ts` (`apps/api` dan `apps/worker`) untuk operasi file: simpan chunk, assemble, hapus, list
- [x] Unit test helper storage: simpan file, baca ulang, hapus, dan pastikan file benar-benar hilang dari disk

---

### #29 — Setup `apps/worker` sebagai proses terpisah
**Label:** `setup`, `backend`, `priority:high`
**Deskripsi:**
Buat aplikasi baru `apps/worker` (Bun process) yang nantinya konsumsi job dari Redis queue, terpisah dari `apps/api`.

**Acceptance Criteria:**
- [x] `apps/worker/package.json` dibuat, terdaftar sebagai workspace member
- [x] `apps/worker/src/index.ts` bisa dijalankan (`bun run dev:worker`) tanpa error, minimal print "Worker started"
- [x] Worker bisa import `@mediaflow/database` (Prisma) via workspace alias
- [x] Script `dev:worker` ditambahkan di root `package.json`

---

### #30 — Install & konfigurasi BullMQ
**Label:** `setup`, `backend`, `priority:high`
**Deskripsi:**
Setup BullMQ sebagai job queue library di atas Redis, dipakai bersama oleh `apps/api` (produce job) dan `apps/worker` (consume job).

**Acceptance Criteria:**
- [x] Package `bullmq` terinstall di `apps/api` dan `apps/worker`
- [x] Definisi queue `transcode-queue` dibuat di lokasi shared (bisa di `packages/shared-types` atau package baru `packages/queue`)
- [x] Test manual: `apps/api` push job dummy, `apps/worker` berhasil menerima & log job tersebut

---

## Epic 6: Model Data & Migrasi Streaming

### #31 — Tambah model `Video`, `VideoRendition`, `TranscodeJob`, `Genre`, `VideoGenre`, `WatchHistory` ke Prisma schema
**Label:** `database`, `priority:high`
**Deskripsi:**
Extend `schema.prisma` di `packages/database` dengan seluruh model yang dibutuhkan modul streaming, sesuai PRD.

**Acceptance Criteria:**
- [x] Semua model (`Video`, `VideoRendition`, `TranscodeJob`, `Genre`, `VideoGenre`, `WatchHistory`) + enum (`VideoStatus`, `JobStatus`) ditambahkan
- [x] Relasi ke `User` (existing) ditambahkan: `videos`, `watchHistory`
- [x] `bunx prisma migrate dev --name add_streaming_models` berhasil tanpa error
- [x] Tabel baru terverifikasi ada di Postgres (`\dt`)

---

### #32 — Tambah field `role` ke model `User` (USER/ADMIN)
**Label:** `database`, `security`, `priority:high`
**Deskripsi:**
Untuk membedakan akses admin (upload, kelola video) vs user biasa (hanya nonton), tambahkan role-based access ke model `User`.

**Acceptance Criteria:**
- [x] Enum `Role { USER, ADMIN }` ditambahkan, field `role` di model `User` dengan default `USER`
- [x] Migrasi berhasil dijalankan
- [x] Minimal 1 user existing di-set manual jadi `ADMIN` (lewat Prisma Studio atau seed script) untuk testing

---

### #33 — Middleware `requireAdmin`
**Label:** `backend`, `security`, `priority:high`
**Deskripsi:**
Middleware tambahan (dibangun di atas `requireAuth` yang sudah ada) yang memvalidasi `role === "ADMIN"`.

**Acceptance Criteria:**
- [x] Return 403 kalau user login tapi bukan admin
- [x] Return 401 kalau belum login sama sekali (delegasi ke `requireAuth`)
- [x] Test: akses dengan user biasa (403), admin (lolos), tanpa login (401)

---

## Epic 7: Upload Video (Chunked)

### #34 — Endpoint POST /videos/upload/init
**Label:** `backend`, `feature`, `priority:high`
**Deskripsi:**
Mulai sesi upload baru — generate `uploadId`, simpan metadata sesi upload ke Redis (nama file, total chunk, ukuran).

**Acceptance Criteria:**
- [x] Protected dengan `requireAdmin`
- [x] Return `uploadId` unik + info `chunkSize` yang dipakai
- [x] Validasi: nama file, ukuran total tidak melebihi `MAX_FILE_SIZE_GB`
- [x] Sesi upload tersimpan di Redis dengan TTL wajar (misal 24 jam) agar sesi basi otomatis terhapus

---

### #35 — Endpoint PUT /videos/upload/:uploadId/chunk/:chunkIndex
**Label:** `backend`, `feature`, `priority:high`
**Deskripsi:**
Terima 1 chunk file, simpan ke `uploads-temp/{uploadId}/`, update status chunk yang diterima di Redis.

**Acceptance Criteria:**
- [x] Validasi `uploadId` ada dan masih valid (belum expired/complete)
- [x] Chunk disimpan dengan nama konsisten (`chunk-{index}`)
- [x] Redis diupdate menandai chunk index tersebut sudah diterima
- [x] Return 200 dengan info progress (berapa chunk sudah diterima dari total)

---

### #36 — Endpoint GET /videos/upload/:uploadId/status
**Label:** `backend`, `feature`, `priority:medium`
**Deskripsi:**
Cek chunk mana saja yang sudah diterima — dipakai frontend untuk resume upload setelah koneksi putus.

**Acceptance Criteria:**
- [x] Return list index chunk yang sudah diterima (dari Redis)
- [x] Return 404 kalau `uploadId` tidak ditemukan/sudah expired

---

### #37 — Endpoint POST /videos/upload/:uploadId/complete
**Label:** `backend`, `feature`, `priority:high`
**Deskripsi:**
Setelah semua chunk diterima, assemble jadi 1 file utuh, simpan ke `raw-temp/`, buat record `Video` (status `UPLOADED`), lalu push job transcoding ke BullMQ.

**Acceptance Criteria:**
- [x] Validasi semua chunk (sesuai total yang didaftarkan saat init) benar-benar sudah diterima, kalau belum lengkap return 400
- [x] File di-assemble berurutan sesuai index chunk, hasil disimpan di `raw-temp/{videoId}.ext`
- [x] Record `Video` dibuat di database dengan status `UPLOADED` lalu `QUEUED`
- [x] Job push ke `transcode-queue` (BullMQ) berisi `videoId` dan path raw file
- [x] Folder `uploads-temp/{uploadId}/` dihapus setelah assembly sukses (chunk sudah tidak dibutuhkan)
- [x] Test: complete dengan chunk lengkap (sukses), complete dengan chunk belum lengkap (400)

---

### #38 — Hook `useChunkedUpload` di frontend
**Label:** `frontend`, `feature`, `priority:high`
**Deskripsi:**
Hook React untuk slice file jadi chunk, upload berurutan/paralel terbatas, tracking progress, dan retry per-chunk kalau gagal.

**Acceptance Criteria:**
- [x] File di-slice sesuai `chunkSize` dari response `/upload/init`
- [x] Progress keseluruhan (persentase) ter-update real-time di state React
- [x] Retry otomatis per-chunk (maksimal N percobaan) kalau 1 chunk gagal terkirim
- [x] Kalau upload dihentikan di tengah (refresh/close tab) dan dibuka lagi, bisa lanjut dari status `/upload/:uploadId/status` (tidak upload ulang chunk yang sudah sukses)

---

### #39 — Halaman & komponen Upload Admin
**Label:** `frontend`, `feature`, `priority:high`
**Deskripsi:**
UI untuk admin pilih file, isi metadata dasar (judul, deskripsi, genre), dan lihat progress upload.

**Acceptance Criteria:**
- [x] Form input file + metadata (judul, deskripsi, genre — bisa multi-select)
- [x] Progress bar upload keseluruhan, ditampilkan real-time
- [x] Validasi client-side: format file didukung, ukuran maksimal
- [x] Redirect/notifikasi ke halaman status setelah upload selesai (lanjut ke tahap transcoding)

---

## Epic 8: Pipeline Transcoding (FFmpeg)

### #40 — Wrapper FFmpeg di `apps/worker`
**Label:** `backend`, `feature`, `priority:high`
**Deskripsi:**
Buat modul yang menjalankan FFmpeg sebagai child process untuk generate 1 rendition HLS dari file raw.

**Acceptance Criteria:**
- [ ] Fungsi `transcodeToRendition(inputPath, outputDir, resolution, bitrate)` menjalankan command FFmpeg sesuai spesifikasi PRD
- [ ] Output `.m3u8` + segment `.ts` tersimpan di folder yang benar
- [ ] Fungsi skip rendition kalau resolusi target lebih tinggi dari video sumber (tidak upscale)
- [ ] Test manual: transcode 1 file sample ke 1 rendition, hasil bisa diputar di VLC/browser

---

### #41 — Worker consume job dari `transcode-queue`
**Label:** `backend`, `feature`, `priority:high`
**Deskripsi:**
Worker mengambil job dari BullMQ, jalankan transcoding untuk semua rendition yang dikonfigurasi (`TRANSCODE_RENDITIONS`), update status ke Postgres.

**Acceptance Criteria:**
- [ ] Job diambil dari queue, status `Video` diupdate jadi `PROCESSING`
- [ ] Setiap rendition dijalankan berurutan (sesuai kapasitas 1 PC — tidak paralel penuh supaya tidak membebani CPU)
- [ ] Record `TranscodeJob` dibuat per rendition, `progress` diupdate berkala dari parsing output FFmpeg
- [ ] Setelah semua rendition sukses, generate master playlist (`master.m3u8`) yang reference semua rendition
- [ ] Status `Video` diupdate jadi `READY`, `masterPlaylistUrl` diisi

---

### #42 — Hapus raw file setelah transcoding sukses
**Label:** `backend`, `feature`, `priority:high`
**Deskripsi:**
Sesuai keputusan PRD — raw file di `raw-temp/` dihapus otomatis segera setelah **semua** rendition tervalidasi sukses.

**Acceptance Criteria:**
- [ ] Penghapusan **hanya** terjadi setelah status `Video` benar-benar `READY` (semua rendition sukses, bukan sebagian)
- [ ] Kalau salah satu rendition gagal, raw file **tidak** dihapus (supaya bisa di-retry tanpa upload ulang)
- [ ] Test: skenario semua sukses → raw terhapus; skenario 1 rendition gagal → raw tetap ada

---

### #43 — Penanganan kegagalan & retry job
**Label:** `backend`, `priority:medium`
**Deskripsi:**
Kalau FFmpeg gagal (file corrupt, format tidak didukung, dll), job di-mark `FAILED` dengan pesan error, bisa di-retry manual oleh admin.

**Acceptance Criteria:**
- [ ] `TranscodeJob.status` jadi `FAILED`, `errorMessage` diisi detail error
- [ ] `Video.status` jadi `FAILED` kalau semua retry otomatis BullMQ habis
- [ ] BullMQ dikonfigurasi retry otomatis (maks 3x, dengan backoff) sebelum dianggap gagal permanen

---

### #44 — Endpoint admin: lihat & retry transcoding job
**Label:** `backend`, `feature`, `priority:medium`
**Deskripsi:**
`GET /admin/videos/:id/jobs` untuk lihat riwayat/progress, `POST /admin/videos/:id/retry` untuk retry manual.

**Acceptance Criteria:**
- [ ] `GET /admin/videos/:id/jobs` return semua `TranscodeJob` terkait video tsb, termasuk progress & error message
- [ ] `POST /admin/videos/:id/retry` push ulang job ke queue, hanya bisa dipanggil kalau status `Video` adalah `FAILED`
- [ ] Keduanya protected `requireAdmin`

---

## Epic 9: Katalog, Playback & Riwayat Tontonan

### #45 — Endpoint GET /videos (katalog + search + filter genre)
**Label:** `backend`, `feature`, `priority:high`
**Deskripsi:**
List video dengan pagination, filter genre, dan search judul dasar.

**Acceptance Criteria:**
- [ ] Hanya video dengan status `READY` yang muncul di katalog publik
- [ ] Support query param: `page`, `limit`, `genre`, `search`
- [ ] Response termasuk `thumbnailUrl`, `title`, `duration`, genre

---

### #46 — Endpoint GET /videos/:id (detail) & GET /videos/trending
**Label:** `backend`, `feature`, `priority:medium`
**Deskripsi:**
Detail 1 video lengkap, dan list video trending berdasarkan `viewCount`.

**Acceptance Criteria:**
- [ ] `/videos/:id` return metadata lengkap + daftar genre
- [ ] `/videos/trending` return video urut `viewCount` descending, limit dikonfigurasi (default 10)
- [ ] Return 404 kalau video tidak ditemukan atau statusnya bukan `READY`

---

### #47 — Endpoint GET /videos/:id/playback (serve HLS terproteksi)
**Label:** `backend`, `feature`, `priority:high`
**Deskripsi:**
Serve file `.m3u8`/`.ts` lewat endpoint API (bukan static file expose langsung), supaya tetap ada pengecekan auth di tiap request segmen.

**Acceptance Criteria:**
- [ ] Protected `requireAuth`
- [ ] Return master playlist dengan path rendition yang benar
- [ ] Segment `.ts` individual juga diserve lewat endpoint yang tervalidasi auth (bukan folder publik)
- [ ] `viewCount` di-increment saat pertama kali video diakses (bisa via endpoint terpisah atau logic sederhana di sini)

---

### #48 — Integrasi HLS.js di frontend (video player)
**Label:** `frontend`, `feature`, `priority:high`
**Deskripsi:**
Halaman detail video dengan player HLS.js yang load master playlist dari endpoint playback.

**Acceptance Criteria:**
- [ ] Player otomatis pilih HLS.js untuk Chrome/Firefox, native `<video>` untuk Safari
- [ ] Adaptive bitrate switching bekerja (bisa diverifikasi lewat network throttling di DevTools)
- [ ] Player kirim `Authorization` header saat request segmen (karena endpoint playback protected)

---

### #49 — Endpoint POST /videos/:id/watch-progress & GET /me/watch-history
**Label:** `backend`, `feature`, `priority:medium`
**Deskripsi:**
Simpan & ambil posisi tontonan terakhir per user per video, untuk fitur "Lanjutkan Menonton".

**Acceptance Criteria:**
- [ ] `POST /videos/:id/watch-progress` upsert `WatchHistory` (`progressSec`, `completed` kalau sudah nonton >95%)
- [ ] `GET /me/watch-history` return list video yang pernah ditonton, urut `lastWatchedAt` terbaru
- [ ] Protected `requireAuth`, hanya bisa akses history milik sendiri

---

### #50 — Frontend: kirim watch-progress berkala + resume playback
**Label:** `frontend`, `feature`, `priority:medium`
**Deskripsi:**
Player kirim event `timeupdate` ke backend tiap ~15 detik, dan set posisi awal video dari progress tersimpan.

**Acceptance Criteria:**
- [ ] Progress terkirim otomatis tanpa mengganggu playback (debounced/throttled, bukan tiap frame)
- [ ] Saat buka video yang sudah pernah ditonton, `video.currentTime` otomatis diset ke posisi terakhir
- [ ] Halaman "Lanjutkan Menonton" di beranda menampilkan list dari `/me/watch-history`

---

### #51 — Endpoint admin: CRUD metadata video & genre
**Label:** `backend`, `feature`, `priority:medium`
**Deskripsi:**
`PATCH /admin/videos/:id`, `DELETE /admin/videos/:id`, dan CRUD dasar untuk `Genre`.

**Acceptance Criteria:**
- [ ] Update judul/deskripsi/genre video
- [ ] Delete video: hapus record + hapus folder `hls/{videoId}/` dari disk (bukan cuma soft delete di database)
- [ ] Endpoint `GET/POST /genres` untuk kelola daftar genre

---

### #52 — Halaman Katalog & Search (frontend)
**Label:** `frontend`, `feature`, `priority:medium`
**Deskripsi:**
Halaman utama menampilkan grid video, filter genre, search bar.

**Acceptance Criteria:**
- [ ] Grid video dengan thumbnail, judul, durasi
- [ ] Filter genre & search terhubung ke query param backend (`/videos`)
- [ ] Section "Trending" dan "Lanjutkan Menonton" di halaman utama

---

### #53 — Dashboard Admin (list video + status transcoding)
**Label:** `frontend`, `feature`, `priority:medium`
**Deskripsi:**
Halaman khusus admin untuk lihat semua video beserta status transcoding, retry job gagal, edit/hapus video.

**Acceptance Criteria:**
- [ ] List semua video (termasuk yang belum `READY`) dengan status jelas (`UPLOADING`/`PROCESSING`/`READY`/`FAILED`)
- [ ] Progress bar transcoding per video (polling status berkala)
- [ ] Tombol retry untuk video berstatus `FAILED`
- [ ] Tombol edit metadata & hapus video

---

## Epic 10: Hardening Streaming (Opsional, backlog)

### #54 — Thumbnail otomatis dari frame video
**Label:** `feature`, `priority:low`
**Deskripsi:** Worker generate thumbnail otomatis (screenshot 1 frame) via FFmpeg saat transcoding.

### #55 — Backup berkala folder `hls/` ke external drive/NAS
**Label:** `infra`, `priority:medium`
**Deskripsi:** Karena raw file dihapus dan hanya HLS yang disimpan, perlu strategi backup supaya konten tidak hilang kalau disk lokal rusak.

### #56 — Setup WireGuard VPN untuk akses jarak jauh
**Label:** `infra`, `priority:high`
**Deskripsi:** Konfigurasi WireGuard di router/server supaya user bisa akses Mediaflow dari luar jaringan lokal.

### #57 — Watchlist ("Simpan untuk nanti")
**Label:** `feature`, `priority:low`

### #58 — Subtitle multi-bahasa (upload .vtt, attach ke HLS)
**Label:** `feature`, `priority:low`

---

## Urutan Pengerjaan (Milestone)

| Milestone | Issue |
|---|---|
| **M1 — Foundation (Auth)** | #1, #2, #3 |
| **M2 — Backend Core (Auth)** | #4, #5, #6, #7, #8, #9, #10, #11 |
| **M3 — Backend Hardening (Auth)** | #12, #13 |
| **M4 — Frontend Core (Auth)** | #14, #15, #16, #17, #18, #19, #20, #21 |
| **M5 — Streaming Infrastructure** | #27, #28, #29, #30 |
| **M6 — Model Data & Role Admin** | #31, #32, #33 |
| **M7 — Upload Chunked** | #34, #35, #36, #37, #38, #39 |
| **M8 — Transcoding Pipeline** | #40, #41, #42, #43, #44 |
| **M9 — Katalog, Playback & Riwayat** | #45, #46, #47, #48, #49, #50, #51, #52, #53 |
| **M10 — Backlog / Enhancement** | #22–#26, #54–#58 |

**Catatan urutan:** M5-M9 (streaming) sebaiknya dimulai **setelah** M1-M4 (auth) selesai, karena modul streaming bergantung penuh pada `requireAuth`/`requireAdmin` middleware dan struktur monorepo yang sudah dibangun di fase auth.
