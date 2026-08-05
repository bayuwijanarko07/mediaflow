# Architecture — Mediaflow

Platform streaming video on-demand (VOD) bergaya Netflix, untuk skala kecil (10–20 pengguna concurrent), di-deploy di **satu PC/server lokal** dan diakses dari luar jaringan lewat **VPN** (bukan lewat internet publik).

Dokumen ini merangkum tech stack, struktur direktori, alur data, komunikasi antar service, dan keputusan-keputusan teknis penting berikut alasannya.

---

## 1. Tech Stack

| Layer | Teknologi | Catatan |
|---|---|---|
| Runtime | **Bun** | Dipakai di `apps/api` dan `apps/worker`; test runner `bun:test` |
| API Framework | **Elysia.js** | REST API, plugin-based (`.use()`), validasi via `t.Object` (TypeBox) |
| Frontend | **Next.js 16** (App Router) + React 19 | `apps/web` |
| Styling | Tailwind CSS v4 | via `@tailwindcss/postcss` |
| Database | **PostgreSQL** | Diakses lewat Prisma |
| ORM | **Prisma 5** | Schema di `packages/database/prisma/schema.prisma`, client di-generate ke `packages/database/generated/client` |
| Queue & Cache | **Redis** + **BullMQ** | Job queue transcoding (`transcode-queue`), session upload sementara |
| Redis client | `Bun.redis` (native) di `apps/api`; `ioredis` di `packages/queue` (khusus BullMQ) | Dua client Redis berbeda untuk kebutuhan berbeda |
| Transcoding | **FFmpeg** (child process via `Bun.spawn`) | Dipanggil dari `apps/worker` |
| Streaming protocol | **HLS** (HTTP Live Streaming) | Multi-bitrate, adaptive |
| Player | **HLS.js** (Chrome/Firefox), native `<video>` (Safari) | `VideoPlayer.tsx` |
| Auth | JWT (access token, 15 menit) + refresh token rotation (cookie httpOnly) | `@elysiajs/jwt` |
| Password hashing | `Bun.password` (argon2id) | |
| Storage | **Local disk** | Tidak ada S3/MinIO — folder biasa di-mount via `STORAGE_ROOT` |
| Monorepo tooling | **Bun workspaces** | `apps/*`, `packages/*`, linker `hoisted` |
| Testing | `bun:test`, `@testing-library/react`, `happy-dom` | |

---

## 2. Struktur Direktori (Monorepo)

```
mediaflow/
├── apps/
│   ├── api/                    # Elysia REST API (Bun)
│   │   └── src/
│   │       ├── index.ts               # entrypoint, compose semua controller
│   │       ├── plugins/                # cors, jwt, rate-limit, error-handler
│   │       ├── middleware/              # requireAuth
│   │       ├── lib/                     # redis, queue, request-metadata
│   │       └── modules/
│   │           ├── auth/                # register/login/refresh/logout, admin.middleware, audit log
│   │           ├── video/               # upload chunked, transcoding trigger, catalog, playback, watch-progress
│   │           ├── genre/
│   │           ├── me/                  # /me/watch-history
│   │           └── health/
│   │
│   ├── worker/                 # Proses terpisah — konsumsi job transcoding
│   │   └── src/
│   │       ├── index.ts               # BullMQ Worker (concurrency: 1)
│   │       ├── jobs/transcode.job.ts   # orkestrasi 1 job transcoding penuh
│   │       ├── lib/                    # ffprobe, ffmpeg, rendition-presets, master-playlist
│   │       └── services/transcode-status.service.ts  # update status ke Postgres
│   │
│   └── web/                    # Next.js App Router (frontend)
│       ├── app/
│       │   ├── (public)/login, /register
│       │   ├── videos/, /videos/[id]        # katalog & detail + player
│       │   ├── admin/upload, /admin/videos  # dashboard admin
│       │   └── components/{auth,video,admin}
│       ├── context/AuthContext.tsx           # state auth global (in-memory token)
│       └── lib/{api-client,token-store,hooks}
│
├── packages/
│   ├── database/     # Prisma schema + client singleton, seed script
│   ├── shared-types/  # Tipe TS bersama (request/response DTO) + konstanta queue
│   ├── queue/         # Wrapper BullMQ connection (ioredis) + re-export tipe job
│   └── storage/       # Helper baca/tulis/hapus file di disk lokal
│
├── compose.yml         # Postgres + Redis (Podman/Docker)
└── PRD-Mediaflow-Streaming.md, issue.md   # dokumen produk & tracking
```

**Aturan dependency arah monorepo:** `packages/*` tidak boleh depend ke `apps/*` (contoh: `packages/database/prisma/seed-helpers.ts` sengaja duplikasi `hashPassword` daripada import dari `apps/api`, supaya arah dependency tetap benar).

---

## 3. Komponen & Tanggung Jawab

### 3.1 `apps/api` (Elysia)
- Autentikasi & sesi (JWT + refresh token rotation, audit log login).
- Manajemen upload chunked (init/chunk/status/complete) — state chunk disimpan di **Redis**, bukan Postgres, karena sifatnya sementara dan butuh operasi atomic frekuensi tinggi (`SADD`/`SCARD`).
- CRUD metadata video, genre (admin only).
- Endpoint publik: katalog, detail, trending.
- Endpoint terproteksi: playback (serve file HLS lewat API, bukan static folder publik), watch-progress.
- **Tidak melakukan transcoding sendiri** — hanya mem-push job ke BullMQ (`transcode-queue`) lalu langsung return response (non-blocking).

### 3.2 `apps/worker` (Bun process terpisah)
- Konsumsi job dari `transcode-queue` (`concurrency: 1` — sesuai kapasitas 1 PC, bukan cloud).
- `probeVideo` (ffprobe) → tentukan rendition yang berlaku (skip upscale) → transcode tiap rendition **sekuensial** via FFmpeg → simpan progress ke `TranscodeJob.progress` → generate master playlist → update `Video.status = READY` → hapus raw file.
- Retry otomatis (BullMQ, maks 3x, exponential backoff) bila FFmpeg gagal; `Video.status` tetap `PROCESSING` sampai retry benar-benar habis, baru di-set `FAILED`.

### 3.3 `apps/web` (Next.js)
- Semua request API lewat `apiFetch`/`api` wrapper (`lib/api-client.ts`) — otomatis `credentials: "include"`, auto-refresh sekali saat 401, dedupe refresh call paralel.
- Access token disimpan **di memory** (`token-store.ts`, bukan localStorage) — disinkronkan dari `AuthContext`; refresh token murni di cookie httpOnly.
- `useChunkedUpload` hook: slice file jadi chunk, upload paralel terbatas (`MAX_PARALLEL_UPLOADS=3`), retry per-chunk, resume dari `sessionStorage` + endpoint `/status`.

---

## 4. Alur Data Utama

### 4.1 Auth: Login → Access Protected Resource → Refresh
```
Client → POST /auth/login
       ← accessToken (body) + refresh_token (Set-Cookie, httpOnly, sameSite=strict)

Client → GET /videos/admin  (Authorization: Bearer <accessToken>)
       ← 401 (access token expired)

Client → POST /auth/refresh (cookie refresh_token otomatis terkirim)
       ← accessToken baru + refresh_token BARU (rotation: token lama di-revoke)

Client → retry GET /videos/admin dengan accessToken baru (hanya 1x retry)
```
- Refresh token disimpan di tabel `refresh_tokens` (Postgres) dengan `expiresAt` & `revoked`.
- **Rotation wajib**: setiap `/auth/refresh` sukses meng-invalidate token lama dan menerbitkan yang baru — mencegah replay token curian.
- `logout-all` me-revoke seluruh refresh token milik user (multi-device).

### 4.2 Upload → Transcode → Playback (alur inti sistem)
```
1. Admin (apps/web) pilih file
   → POST /videos/upload/init            (apps/api)
     - Validasi ukuran ≤ MAX_FILE_SIZE_GB
     - Buat uploadId, hitung totalChunks
     - Simpan metadata sesi ke Redis (TTL 24h)

2. Untuk tiap chunk:
   → PUT /videos/upload/:uploadId/chunk/:chunkIndex
     - Chunk disimpan ke disk: uploads-temp/{uploadId}/chunk-{i}
     - Index chunk ditandai via Redis SET (SADD) — atomic, aman untuk
       upload PARALEL tanpa race condition (lihat §6.3)

3. (Opsional) GET /videos/upload/:uploadId/status
     - Cek chunk mana yang sudah diterima → dipakai frontend untuk resume

4. → POST /videos/upload/:uploadId/complete
     - Validasi semua chunk lengkap (SCARD == totalChunks)
     - Assemble chunk → raw-temp/{videoId}.ext (urut index)
     - Buat record Video (status UPLOADED → QUEUED)
     - Push job ke Redis (BullMQ: transcode-queue) { videoId, rawFilePath }
     - Hapus folder uploads-temp/{uploadId}/
     - Response langsung (TIDAK menunggu transcoding selesai)

5. apps/worker mengambil job dari queue:
     - markVideoProcessing()
     - probeVideo() → resolusi & durasi sumber
     - filterPresetsBySourceResolution() → skip rendition > resolusi asli
     - Loop SEKUENSIAL per rendition:
         ffmpeg → hls/{videoId}/{label}/playlist.m3u8 + segment_*.ts
         update progress ke TranscodeJob (dibaca dashboard admin via polling)
     - generateMasterPlaylist() → hls/{videoId}/master.m3u8
     - markVideoReady() → Video.status = READY
     - HANYA SETELAH SEMUA rendition sukses: hapus raw file
       (kalau gagal di tengah jalan, raw file TETAP ADA untuk retry manual)

6. End user membuka video:
   → GET /videos/:id/playback              (requireAuth)
     - Validasi status READY, increment viewCount SEKALI per sesi
     ← { masterPlaylistUrl }
   → GET /videos/:id/playback/master.m3u8  (requireAuth, serve via API)
   → GET /videos/:id/playback/:rendition/:filename  (requireAuth)
     - Validasi ketat format rendition (`^\d{3,4}p$`) & filename
       (`playlist.m3u8` atau `segment_\d{3,}\.ts`) — cegah path traversal
     - HLS.js otomatis switch bitrate; browser kirim Authorization header
       lewat xhrSetup custom (karena endpoint protected, bukan static file publik)

7. Player kirim timeupdate (throttled ~15 detik):
   → POST /videos/:id/watch-progress
     - Upsert WatchHistory; completed = true jika progress ≥ 95% durasi
   → GET /me/watch-history  → dipakai section "Lanjutkan Menonton"
```

### 4.3 Retry Transcoding Gagal (admin)
```
GET  /videos/admin/:id/jobs    → riwayat semua percobaan TranscodeJob
POST /videos/admin/:id/retry   → hanya valid jika Video.status == FAILED
                                  DAN rawFileKey masih ada di disk
                                → push ulang job ke transcode-queue
```

---

## 5. Komunikasi Antar Service

| Dari | Ke | Mekanisme | Data |
|---|---|---|---|
| apps/web | apps/api | HTTP (fetch, `credentials: include`) | JSON, chunk biner (octet-stream) |
| apps/api | Postgres | Prisma Client | User, Video, TranscodeJob, WatchHistory, dll |
| apps/api | Redis | `Bun.redis` (native) | Upload session (JSON) + received-chunks (Set) |
| apps/api | apps/worker | **Tidak langsung** — lewat Redis (BullMQ queue `transcode-queue`) | `{ videoId, rawFilePath }` |
| apps/worker | Postgres | Prisma Client (via `@mediaflow/database`, sama seperti apps/api) | Update status Video & TranscodeJob |
| apps/worker | Disk lokal | `@mediaflow/storage` (fs API Bun) | raw file → HLS output |
| apps/web | apps/api (playback) | HLS.js `xhrSetup` menyisipkan `Authorization: Bearer` di tiap request segmen `.ts`/`.m3u8` | — |

**Catatan penting:** `apps/api` dan `apps/worker` adalah proses Bun **terpisah** yang **tidak pernah saling memanggil langsung** — satu-satunya jalur komunikasi adalah Redis (job queue) dan Postgres (shared state via `packages/database`). Ini memungkinkan API tetap responsif (non-blocking) sementara transcoding (proses berat, bisa menit–jam) berjalan di background.

---

## 6. Keputusan Teknis & Alasannya

### 6.1 Job queue (BullMQ + Redis) alih-alih transcode sinkron di request
Transcoding adalah proses berat & lama. Kalau dijalankan langsung di HTTP request, request akan timeout dan API jadi blocking. `POST /upload/:id/complete` cukup mendaftarkan job lalu langsung return — proses berat dikerjakan `apps/worker` secara async. `concurrency: 1` di Worker sengaja dibatasi karena target deployment adalah **1 PC lokal**, bukan cluster cloud.

### 6.2 Raw file dihapus HANYA setelah SEMUA rendition sukses
Kebijakan retensi raw = 0 (untuk hemat disk lokal) berisiko kehilangan sumber video permanen kalau dihapus terlalu dini. Karena itu:
- Penghapusan raw file terjadi **setelah** `Video.status = READY` tercapai (semua rendition, bukan sebagian).
- Kalau ada rendition yang gagal → raw file **tidak pernah dihapus**, supaya admin bisa retry manual tanpa upload ulang (lihat `retryVideoTranscoding` yang memvalidasi `pathExists(rawFileKey)`).
- Di jalur `catch` transcode job, `deleteFile(rawFilePath)` sengaja **tidak pernah dipanggil**, baik masih akan di-retry BullMQ maupun sudah gagal permanen.

### 6.3 Redis Set (bukan JSON read-modify-write) untuk tracking chunk upload
Chunk upload dikirim **paralel** dari frontend (`MAX_PARALLEL_UPLOADS = 3`). Pola lama (baca JSON metadata → tambah index → tulis balik) rawan **race condition/lost update** saat beberapa request `PUT chunk` datang bersamaan. Solusi: index chunk yang diterima disimpan di **Redis Set terpisah** (`upload-session:{id}:received-chunks`), di-update via `SADD` (atomic, single-threaded execution di Redis) dan dihitung via `SCARD`. Ada test regresi eksplisit (`concurrent-chunks.test.ts`) yang mengirim 11 chunk bersamaan via `Promise.all` untuk memverifikasi tidak ada chunk yang hilang.

### 6.4 Access token di memory, refresh token di cookie httpOnly
- Access token (masa berlaku pendek, 15 menit) disimpan di **module-level variable** (`token-store.ts`), bukan localStorage — menghindari eksposur ke XSS.
- Refresh token (masa berlaku panjang, 7 hari) disimpan sebagai cookie `httpOnly`, `sameSite: strict`, tidak bisa diakses JavaScript sama sekali.
- Refresh **rotation**: tiap kali dipakai, token lama di-revoke dan diganti baru — token lama yang dicuri/direplay otomatis invalid setelah dipakai sekali oleh pemilik asli.
- `token-store.ts` sengaja terpisah dari `AuthContext` (React) supaya `api-client.ts` (fungsi biasa, dipanggil dari luar komponen React) bisa akses token terkini tanpa perlu `useContext`.

### 6.5 File `.m3u8`/`.ts` diserve lewat endpoint API, bukan static folder publik
Supaya tetap ada pengecekan `requireAuth` di **setiap** request segmen (bukan cuma saat load halaman). Validasi input `rendition`/`filename` sangat ketat (`^\d{3,4}p$`, `^segment_\d{3,}\.ts$`) untuk mencegah path traversal — ada test eksplisit untuk kasus ini.

### 6.6 Role-based access: `requireAuth` vs `requireAdmin`
`requireAdmin` dibangun **di atas** `requireAuth` (bukan reimplementasi terpisah) — delegasi 401 (belum login) ke layer bawah, baru cek `role === "ADMIN"` untuk 403. Semua endpoint upload & manajemen video admin-only; katalog & playback cukup login biasa (`USER`).

### 6.7 Tidak ada S3/MinIO/CDN — disk lokal langsung
Sesuai skala target (10–20 user, 1 PC, akses via VPN), kompleksitas object storage terdistribusi tidak dibutuhkan. `packages/storage` adalah wrapper tipis di atas `node:fs` — `getStoragePath()` jadi satu-satunya sumber kebenaran path (`uploads-temp/`, `raw-temp/`, `hls/`) supaya tidak ada hardcode path tersebar di banyak file.

### 6.8 Rate limiting hanya di endpoint auth
`elysia-rate-limit` dipasang khusus di `/auth/*` (login/register) untuk cegah brute-force, dengan limit dinaikkan drastis (`10000`) di `NODE_ENV=test` supaya test paralel tidak saling mengganggu state in-memory rate limiter.

### 6.9 Login audit log fail-safe
`recordLoginAttempt` sengaja **swallow error** internal (try/catch tanpa re-throw) — kegagalan mencatat log tidak boleh menggagalkan proses login itu sendiri, karena audit log adalah fitur pendukung, bukan critical path.

### 6.10 Watch history: threshold "completed"
Video dianggap selesai ditonton kalau `progressSec ≥ 95% durationSec` (`WATCH_COMPLETED_THRESHOLD`). Upsert (bukan insert) per `[userId, videoId]` (unique constraint) — 1 baris per user per video, selalu overwrite ke posisi terakhir.

### 6.11 Video publik hanya yang `status = READY`
Katalog (`getVideoCatalog`), detail (`getVideoDetail`), trending, dan watch-history semua secara konsisten memfilter `status: "READY"` — video yang masih `PROCESSING`/`FAILED`/`QUEUED` dianggap "tidak ada" dari sudut pandang end user, meski recordnya sudah ada di database (dan terlihat penuh oleh admin lewat `getAdminVideoList`, tanpa filter status).

---

## 7. Skema Data Inti (ringkas)

```
User 1───* RefreshToken
User 1───* Video (uploadedBy)         Video 1───* VideoRendition
User 1───* WatchHistory               Video 1───* TranscodeJob
User 1───* LoginAuditLog              Video *───* Genre (via VideoGenre)
                                       Video 1───* WatchHistory
```
- `Video.status`: `UPLOADING → UPLOADED → QUEUED → PROCESSING → READY | FAILED`
- `TranscodeJob.status`: `PENDING → RUNNING → COMPLETED | FAILED` (1 job record dibuat per **percobaan** transcoding, bukan per rendition — riwayat lengkap tersimpan untuk debugging admin)
- Cascade delete: hapus `Video` otomatis hapus `VideoRendition`, `TranscodeJob`, `VideoGenre`, `WatchHistory` terkait (diverifikasi via `schema.test.ts`).

---

## 8. Non-Goals (Sengaja Di Luar Scope v1)

- Live streaming (hanya VOD).
- DRM tingkat lanjut (Widevine/FairPlay) — cukup auth + endpoint protected.
- CDN / multi-region storage — single-server, akses via VPN.
- Horizontal scaling worker — 1 worker, `concurrency: 1`, sesuai kapasitas 1 PC.
- Rekomendasi berbasis ML — trending murni berdasar `viewCount`.

Lihat `PRD-Mediaflow-Streaming.md` dan `issue.md` untuk detail acceptance criteria per fitur dan riwayat keputusan produk.
