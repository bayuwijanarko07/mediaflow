# PRD — Mediaflow: Platform Streaming Video (Netflix-like)

| | |
|---|---|
| **Produk** | Mediaflow |
| **Versi Dokumen** | 1.0 |
| **Tanggal** | 17 Juli 2026 |
| **Status** | Draft |
| **Stack** | Next.js, Bun, Elysia.js, PostgreSQL, Prisma ORM, Redis, FFmpeg, HLS |

---

## 1. Ringkasan Eksekutif

Mediaflow adalah platform streaming video on-demand (VOD) yang memungkinkan admin/creator meng-upload video, sistem memproses video tersebut menjadi format adaptive streaming (HLS), dan pengguna akhir menonton video tersebut dengan kualitas yang otomatis menyesuaikan kecepatan koneksi mereka — mirip pengalaman Netflix/YouTube.

Dokumen ini melanjutkan fondasi sistem autentikasi (JWT + refresh token) yang sudah dibangun sebelumnya, dan menambahkan modul inti: **upload video (chunked)**, **pipeline transcoding (FFmpeg + queue)**, **HLS packaging**, dan **pemutaran adaptif di sisi klien**.

---

## 2. Tujuan & Non-Tujuan

### 2.1 Tujuan (Goals)
- Pengguna bisa menonton video dengan kualitas adaptif (auto bitrate switching) tanpa buffering berlebihan.
- Admin/creator bisa upload file video besar (>1GB) secara andal lewat **chunked upload**, tahan terhadap koneksi terputus.
- Video yang di-upload otomatis diproses (transcode) ke beberapa resolusi (240p–1080p) dalam format HLS tanpa campur tangan manual.
- Sistem melayani **skala kecil (10-20 pengguna concurrent)**, dijalankan di **satu PC/server lokal** (bukan cloud), diakses dari luar jaringan lokal lewat **VPN** (bukan lewat internet publik langsung).
- Riwayat tontonan, resume playback ("lanjutkan menonton"), dan katalog video dengan kategori/genre.
- Storage raw video **tidak disimpan permanen** — file mentah dihapus otomatis segera setelah transcoding berhasil, untuk menghemat kapasitas disk lokal yang terbatas.

> **Konteks deployment penting:** Karena target skala hanya 10-20 pengguna dan server berjalan di PC lokal (bukan cloud/CDN), banyak keputusan arsitektur di dokumen ini disederhanakan dibanding platform streaming skala besar — tidak ada horizontal scaling worker, tidak ada CDN, tidak ada multi-region storage. Ini keputusan sadar untuk menjaga kompleksitas tetap rendah sesuai kebutuhan riil.

### 2.2 Non-Tujuan (Out of Scope untuk v1)
- Live streaming (siaran langsung) — v1 hanya VOD (Video on Demand).
- DRM (Digital Rights Management) tingkat lanjut (Widevine/FairPlay) — v1 pakai proteksi dasar (signed URL + auth).
- Rekomendasi berbasis ML — v1 pakai kategori/genre manual dan "trending" berbasis view count sederhana.
- Multi-region CDN — v1 asumsikan single-region deployment, CDN bisa jadi fase berikutnya.
- Aplikasi mobile native — v1 fokus web (Next.js) responsive.

---

## 3. Target Pengguna (Personas)

| Persona | Deskripsi | Kebutuhan Utama |
|---|---|---|
| **Penonton (End User)** | Pengguna umum yang mendaftar untuk menonton konten | Playback lancar, pencarian mudah, resume tontonan, rekomendasi dasar |
| **Content Admin/Creator** | Pengelola konten yang upload dan atur metadata video | Upload andal untuk file besar, progress upload jelas, status transcoding transparan |
| **Superadmin** | Pengelola platform secara keseluruhan | Kelola user, moderasi konten, monitoring sistem (job queue, storage) |

---

## 4. Ringkasan Fitur (Prioritas MoSCoW)

### Must Have (v1)
- Autentikasi (sudah dibangun — register/login/refresh/logout, lihat dokumen auth terpisah)
- Upload video chunked dari frontend (Next.js) dengan resume capability
- Pipeline transcoding otomatis (FFmpeg) menghasilkan multi-bitrate HLS
- Player video adaptive streaming (HLS.js)
- Katalog video (list, detail, kategori/genre, search dasar)
- Riwayat tontonan & resume playback ("Lanjutkan Menonton")
- Admin panel dasar: upload, edit metadata, lihat status transcoding, hapus video

### Should Have (v1.x)
- Watchlist / "Simpan untuk nanti"
- Rating/like sederhana
- Thumbnail otomatis (generate dari frame video)
- Notifikasi status transcoding (email/in-app)

### Could Have (v2+)
- Subtitle multi-bahasa (upload .vtt, auto-attach ke HLS)
- Multiple audio track
- Analytics dashboard (jam tonton, video populer)
- Rate limiting per-user untuk streaming (anti password/link sharing berlebihan)

### Won't Have (v1)
- Live streaming
- DRM tingkat lanjut
- Rekomendasi berbasis ML

---

## 5. Arsitektur Sistem

### 5.1 Diagram Arsitektur Tingkat Tinggi

```
┌─────────────────┐         ┌──────────────────────────────────────┐
│                  │  HTTPS  │              apps/api                 │
│   apps/web       │────────▶│         (Bun + Elysia.js)             │
│   (Next.js)      │         │  - Auth (existing)                    │
│                  │◀────────│  - Video metadata CRUD                │
│  - Chunked       │  JSON   │  - Upload session management          │
│    upload UI     │         │  - Signed URL untuk playback          │
│  - HLS.js player │         └──────────┬─────────────┬──────────────┘
└─────────┬────────┘                    │             │
          │                             │             │
          │ PUT chunks                  │             │
          ▼                             ▼             ▼
┌──────────────────┐          ┌─────────────┐  ┌──────────────┐
│  Object Storage   │          │ PostgreSQL  │  │    Redis     │
│  (raw uploads +   │          │  (Prisma)   │  │ - Job queue  │
│   HLS output)     │          │  - Video    │  │   (BullMQ)   │
│  S3-compatible /  │          │  - metadata │  │ - Cache      │
│  local disk (dev) │          │  - watch    │  │ - Session    │
└─────────▲──────────┘         │    history  │  │   upload     │
          │                    └─────────────┘  └──────┬───────┘
          │ read/write raw                              │
          │ write HLS segments                          │ consume job
          │                                              ▼
          │                                     ┌──────────────────┐
          └─────────────────────────────────────│  apps/worker      │
                                                  │  (Bun process)    │
                                                  │  - Ambil job dari │
                                                  │    Redis queue    │
                                                  │  - Jalankan FFmpeg│
                                                  │  - Generate HLS   │
                                                  │    multi-bitrate  │
                                                  │  - Update status  │
                                                  │    ke Postgres    │
                                                  └──────────────────┘
```

### 5.2 Alur Data Utama

**Alur Upload → Transcode → Playback:**
1. Admin pilih file video di `apps/web` → frontend pecah file jadi chunks (mis. 5MB/chunk)
2. Tiap chunk di-PUT ke endpoint `apps/api`, disimpan sementara di storage (atau langsung di-assemble)
3. Setelah semua chunk diterima, `apps/api` gabungkan (assemble) jadi 1 file utuh, simpan ke object storage, buat record `Video` dengan status `UPLOADED`
4. `apps/api` push job transcoding ke **Redis queue** (via BullMQ)
5. `apps/worker` (proses terpisah, bisa di-scale independen) ambil job dari queue, jalankan FFmpeg untuk generate beberapa rendition (240p/480p/720p/1080p) dalam format HLS (`.m3u8` + segment `.ts`)
6. Worker simpan hasil HLS ke disk lokal, update status `Video` di Postgres jadi `READY`, simpan path master playlist
7. **Worker langsung menghapus file raw** dari disk (baik yang di lokasi upload sementara maupun hasil assembly) — tidak ada retensi raw file sama sekali, murni untuk menghemat kapasitas disk PC lokal
8. End user (di jaringan lokal, atau dari luar lewat **VPN**) buka halaman video → frontend minta signed URL playback dari `apps/api` → player (HLS.js) load master `.m3u8` dari server lokal → otomatis switch bitrate sesuai kecepatan koneksi

---

## 6. Stack Teknologi & Peran Masing-masing

| Layer | Teknologi | Peran |
|---|---|---|
| Frontend | **Next.js** | UI katalog, player, dashboard admin, chunked upload client |
| Runtime backend | **Bun** | Runtime untuk API server & worker transcoding |
| API Framework | **Elysia.js** | REST API: auth, video CRUD, upload session, signed URL |
| Database | **PostgreSQL** | Metadata video, user, watch history, job status |
| ORM | **Prisma** | Schema & query ke PostgreSQL |
| Queue & Cache | **Redis** (+ BullMQ) | Job queue transcoding, cache metadata populer, rate limiting |
| Transcoding | **FFmpeg** | Konversi video mentah → multi-bitrate HLS |
| Streaming protocol | **HLS** (HTTP Live Streaming) | Format adaptive bitrate streaming |
| Player (client) | **HLS.js** | Memutar HLS di browser (native Safari, HLS.js untuk Chrome/Firefox) |
| Storage | **Local disk** (folder di PC/server lokal) | Simpan file mentah sementara (dihapus setelah transcode) & output HLS permanen |
| Akses jarak jauh | **VPN** (WireGuard/OpenVPN) | Pengguna di luar jaringan lokal terhubung ke server lewat VPN, bukan expose ke internet publik |

---

## 7. Model Data (Skema Prisma — Tambahan dari Auth yang Sudah Ada)

```prisma
model Video {
  id            String        @id @default(uuid())
  title         String
  description   String?
  status        VideoStatus   @default(UPLOADING)
  durationSec   Int?
  thumbnailUrl  String?
  masterPlaylistUrl String?   // path ke master .m3u8 setelah transcode selesai
  rawFileKey    String?       // path file mentah di object storage
  uploadedById  String
  uploadedBy    User          @relation(fields: [uploadedById], references: [id])
  genres        VideoGenre[]
  viewCount     Int           @default(0)
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  renditions    VideoRendition[]
  transcodeJobs TranscodeJob[]
  watchHistory  WatchHistory[]

  @@index([status])
  @@map("videos")
}

enum VideoStatus {
  UPLOADING
  UPLOADED
  QUEUED
  PROCESSING
  READY
  FAILED
}

model VideoRendition {
  id         String   @id @default(uuid())
  videoId    String
  video      Video    @relation(fields: [videoId], references: [id], onDelete: Cascade)
  resolution String   // "1080p", "720p", "480p", "240p"
  bitrateKbps Int
  playlistUrl String  // path ke .m3u8 rendition ini
  createdAt  DateTime @default(now())

  @@map("video_renditions")
}

model TranscodeJob {
  id          String     @id @default(uuid())
  videoId     String
  video       Video      @relation(fields: [videoId], references: [id], onDelete: Cascade)
  status      JobStatus  @default(PENDING)
  progress    Int        @default(0) // persentase 0-100
  errorMessage String?
  startedAt   DateTime?
  completedAt DateTime?
  createdAt   DateTime   @default(now())

  @@map("transcode_jobs")
}

enum JobStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
}

model Genre {
  id     String       @id @default(uuid())
  name   String       @unique
  videos VideoGenre[]

  @@map("genres")
}

model VideoGenre {
  videoId String
  genreId String
  video   Video @relation(fields: [videoId], references: [id], onDelete: Cascade)
  genre   Genre @relation(fields: [genreId], references: [id], onDelete: Cascade)

  @@id([videoId, genreId])
  @@map("video_genres")
}

model WatchHistory {
  id             String   @id @default(uuid())
  userId         String
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  videoId        String
  video          Video    @relation(fields: [videoId], references: [id], onDelete: Cascade)
  progressSec    Int      @default(0) // posisi terakhir ditonton (detik)
  completed      Boolean  @default(false)
  lastWatchedAt  DateTime @updatedAt

  @@unique([userId, videoId])
  @@map("watch_history")
}
```

> Model `User` dan `RefreshToken` mengacu ke skema auth yang sudah dibangun sebelumnya; ditambahkan relasi `videos`, `watchHistory` di model `User`.

---

## 8. Desain API (Endpoint Utama)

### 8.1 Upload (Chunked)

| Method | Endpoint | Deskripsi |
|---|---|---|
| POST | `/videos/upload/init` | Mulai sesi upload baru, return `uploadId` + info chunk size |
| PUT | `/videos/upload/:uploadId/chunk/:chunkIndex` | Upload 1 chunk tertentu |
| GET | `/videos/upload/:uploadId/status` | Cek chunk mana saja yang sudah diterima (untuk resume) |
| POST | `/videos/upload/:uploadId/complete` | Tandai upload selesai, trigger assembly + queue transcoding |

### 8.2 Manajemen Video (Admin)

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/admin/videos` | List semua video + status transcoding |
| PATCH | `/admin/videos/:id` | Update metadata (judul, deskripsi, genre) |
| DELETE | `/admin/videos/:id` | Hapus video (soft delete + hapus file storage) |
| GET | `/admin/videos/:id/jobs` | Lihat riwayat & progress transcoding job |
| POST | `/admin/videos/:id/retry` | Retry transcoding kalau job gagal |

### 8.3 Katalog & Playback (Publik/User)

| Method | Endpoint | Deskripsi |
|---|---|---|
| GET | `/videos` | List video (pagination, filter genre, search judul) |
| GET | `/videos/:id` | Detail video + metadata |
| GET | `/videos/:id/playback` | Return signed URL master playlist (`.m3u8`) — protected |
| GET | `/videos/trending` | Video dengan view count tertinggi |
| POST | `/videos/:id/watch-progress` | Simpan posisi tontonan terakhir |
| GET | `/me/watch-history` | Riwayat tontonan user (untuk "Lanjutkan Menonton") |
| GET | `/genres` | List semua genre/kategori |

---

## 9. Detail Alur Upload Chunked (Frontend Next.js)

### 9.1 Strategi
- File dipecah jadi chunk berukuran tetap (misal **5MB**) di sisi klien pakai `File.slice()`.
- Tiap chunk dikirim sebagai request `PUT` terpisah, dengan header berisi `uploadId` dan `chunkIndex`.
- Frontend menyimpan progress upload (chunk mana yang sudah sukses) di state React, sehingga kalau koneksi putus, upload bisa **dilanjutkan** dari chunk terakhir yang gagal (bukan mulai dari 0).
- Upload paralel terbatas (misal 3 chunk bersamaan) untuk memaksimalkan throughput tanpa membanjiri server.

### 9.2 Komponen Frontend yang Dibutuhkan
- `useChunkedUpload` hook — mengelola slicing file, tracking progress, retry logic per chunk
- `UploadProgressBar` — komponen visual progress keseluruhan + status per chunk (opsional)
- Validasi client-side: ukuran file maksimal, format file (`mp4`, `mov`, `mkv`, dll)

### 9.3 Penyimpanan Sementara di Backend
- Redis dipakai untuk **tracking status upload session** (chunk mana yang sudah diterima) — lebih cepat dibanding query Postgres berulang kali untuk data sementara ini.
- Chunk mentah disimpan sementara di local disk/object storage dengan naming `{uploadId}/chunk-{index}`.
- Setelah `complete` dipanggil dan semua chunk terverifikasi lengkap, proses **assembly** (gabungkan semua chunk jadi 1 file) dijalankan, lalu file chunk sementara dihapus.

---

## 10. Detail Pipeline Transcoding (FFmpeg + Redis Queue)

### 10.1 Alasan Pakai Job Queue (Bukan Proses Langsung di Request)
Transcoding video adalah proses **berat dan lama** (bisa menit hingga jam tergantung durasi/resolusi). Kalau dijalankan langsung di dalam HTTP request, request akan timeout dan API server jadi blocking. Solusinya: request `complete` upload cuma **mendaftarkan job** ke Redis queue, lalu langsung return response — proses berat dikerjakan `apps/worker` secara asynchronous di background.

### 10.2 Rendition yang Dihasilkan (default)

| Label | Resolusi | Target Bitrate |
|---|---|---|
| 1080p | 1920x1080 | ~5000 kbps |
| 720p | 1280x720 | ~2800 kbps |
| 480p | 854x480 | ~1400 kbps |
| 240p | 426x240 | ~600 kbps |

> Worker otomatis skip rendition yang resolusinya lebih tinggi dari video asli (misal video sumber 720p tidak akan dipaksa upscale ke 1080p).

### 10.3 Contoh Command FFmpeg (Konseptual)

Untuk tiap rendition, worker menjalankan FFmpeg untuk menghasilkan segmented HLS:

```bash
ffmpeg -i input.mp4 \
  -vf scale=-2:720 -c:v h264 -b:v 2800k \
  -c:a aac -b:a 128k \
  -hls_time 6 -hls_playlist_type vod \
  -hls_segment_filename "720p_%03d.ts" \
  720p.m3u8
```

Setelah semua rendition selesai, worker membuat **master playlist** yang merujuk ke semua rendition:

```
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
1080p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720
720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=854x480
480p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=600000,RESOLUTION=426x240
240p.m3u8
```

### 10.4 Update Progress Real-time
- Worker parse output FFmpeg (`-progress` flag) untuk menghitung persentase selesai per rendition, update kolom `progress` di tabel `TranscodeJob` secara berkala.
- Frontend admin panel bisa polling `GET /admin/videos/:id/jobs` tiap beberapa detik, atau (fase lanjutan) pakai WebSocket/SSE untuk update real-time tanpa polling.

### 10.5 Penanganan Kegagalan
- Kalau FFmpeg gagal (file corrupt, format tidak didukung, dll), job di-mark `FAILED` dengan `errorMessage`.
- Admin bisa retry manual lewat endpoint `/admin/videos/:id/retry`.
- BullMQ mendukung retry otomatis dengan backoff — dikonfigurasi maksimal 3x percobaan otomatis sebelum benar-benar dianggap gagal permanen.

---

## 11. Playback di Sisi Frontend

### 11.1 Player
- Pakai **HLS.js** untuk browser yang tidak native support HLS (Chrome, Firefox, Edge). Safari sudah native support HLS lewat tag `<video>` biasa.
- Player otomatis pilih rendition sesuai bandwidth terdeteksi, dan bisa switch di tengah pemutaran tanpa buffer penuh (adaptive bitrate streaming).

### 11.2 Proteksi Akses (Disederhanakan untuk Konteks Jaringan Tertutup)
- Karena server hanya bisa diakses lewat VPN oleh 10-20 orang yang dikenal (bukan publik terbuka), **tidak perlu signed URL bertingkat** seperti platform skala besar. Cukup:
  - Endpoint `/videos/:id/playback` tetap protected oleh `requireAuth` middleware (harus login).
  - File `.m3u8`/`.ts` di-serve lewat endpoint API (bukan expose folder `hls/` langsung sebagai static public), supaya tetap ada pengecekan auth di setiap request segmen.
- **Tidak perlu masa berlaku token pendek/signed URL kompleks** untuk v1 — proteksi utama sudah cukup lewat lapisan VPN + auth JWT biasa. Ini bisa ditingkatkan kalau nanti skala/exposure bertambah.

### 11.3 Resume Playback ("Lanjutkan Menonton")
- Player kirim event `timeupdate` ke backend secara periodik (misal tiap 15 detik) lewat `POST /videos/:id/watch-progress`.
- Saat user buka video yang sama lagi, frontend fetch `progressSec` terakhir dan set `video.currentTime` ke posisi tersebut sebelum play.

---

## 12. Kebutuhan Non-Fungsional

| Kategori | Kebutuhan |
|---|---|
| **Performa** | Playback harus mulai dalam <2 detik (time-to-first-frame) pada koneksi lokal/VPN yang stabil |
| **Skalabilitas** | Cukup 1 instance worker berjalan di PC yang sama — tidak perlu horizontal scaling untuk target 10-20 user concurrent |
| **Keamanan** | Semua endpoint upload & admin wajib `requireAuth`; akses dari luar wajib lewat VPN, tidak ada exposure langsung ke internet publik |
| **Reliabilitas upload** | Upload harus tahan terhadap koneksi terputus — chunk yang sudah terkirim tidak perlu diulang |
| **Storage** | Karena raw file dihapus segera setelah transcode, kebutuhan storage jangka panjang hanya untuk **output HLS saja** (bukan 2-3x lipat) — namun tetap perlu buffer disk sementara seukuran file terbesar yang diupload untuk proses assembly + transcoding berjalan |
| **Observability** | Log setiap job transcoding (mulai, progress, selesai/gagal) untuk debugging; karena single-server, log cukup disimpan di file lokal/console, tidak perlu log aggregator terpusat |
| **Ketersediaan (Availability)** | Server adalah single point of failure (1 PC) — kalau PC mati/restart, semua akses terhenti. Untuk skala 10-20 user internal, ini trade-off yang diterima demi kesederhanaan; tidak perlu high-availability setup |

---

## 13. Infrastruktur & Deployment (Skala Kecil, Lokal + VPN)

Karena target hanya 10-20 pengguna dan server berjalan di **satu PC/server lokal** (bukan cloud), infrastruktur disederhanakan — **tidak perlu MinIO/S3, tidak perlu CDN**. Storage cukup pakai folder di disk lokal, dan akses dari luar jaringan rumah/kantor dilakukan lewat **VPN**.

### 13.1 Tambahan Service di `compose.yml`

```yaml
services:
  postgres:
    # ...sudah ada dari setup sebelumnya

  redis:
    image: docker.io/redis:7-alpine
    container_name: mediaflow-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - mediaflow_redisdata:/data

volumes:
  mediaflow_pgdata:
  mediaflow_redisdata:
```

> Tidak ada service object storage terpisah (MinIO/S3) — file disimpan langsung sebagai folder di disk PC yang menjalankan `apps/api` dan `apps/worker`, di-mount sebagai volume biasa.

### 13.2 Struktur Folder Storage Lokal

```
mediaflow-storage/
├── uploads-temp/          # chunk sementara saat upload berlangsung
│   └── {uploadId}/
│       ├── chunk-0
│       ├── chunk-1
│       └── ...
├── raw-temp/              # file hasil assembly, HANYA sementara — dihapus setelah transcode sukses
│   └── {videoId}.mp4
└── hls/                   # output final, disimpan permanen
    └── {videoId}/
        ├── master.m3u8
        ├── 1080p.m3u8
        ├── 1080p_000.ts, 1080p_001.ts, ...
        ├── 720p.m3u8
        ├── 480p.m3u8
        └── 240p.m3u8
```

`apps/api` dan `apps/worker` mengakses folder ini lewat path lokal langsung (`fs` API Bun/Node), tanpa perlu SDK S3 sama sekali — jauh lebih sederhana untuk skala ini.

### 13.3 Struktur Monorepo Tambahan

```
apps/
├── api/          # Elysia — sudah ada
├── web/          # Next.js — sudah ada
└── worker/        # BARU — proses transcoding terpisah
    └── src/
        ├── index.ts           # entry point, konsumsi Redis queue
        ├── jobs/
        │   └── transcode.job.ts
        └── lib/
            ├── ffmpeg.ts       # wrapper command FFmpeg
            └── storage.ts      # helper baca/tulis/hapus file di disk lokal
```

### 13.4 Environment Variables Tambahan

```env
# Redis
REDIS_URL="redis://localhost:6379"

# Storage lokal (path absolut ke folder di disk PC)
STORAGE_ROOT="D:\mediaflow-storage"
STORAGE_UPLOADS_TEMP_DIR="uploads-temp"
STORAGE_RAW_TEMP_DIR="raw-temp"
STORAGE_HLS_DIR="hls"

# Upload
CHUNK_SIZE_MB=5
MAX_FILE_SIZE_GB=10

# Transcoding
FFMPEG_PATH="/usr/bin/ffmpeg"
TRANSCODE_RENDITIONS="1080p,720p,480p,240p"
DELETE_RAW_AFTER_TRANSCODE=true
```

### 13.5 Akses Jarak Jauh via VPN

Karena server tidak di-expose ke internet publik, pengguna yang mengakses dari luar jaringan lokal (rumah/kantor) **wajib terhubung lewat VPN** terlebih dulu, baru bisa membuka `apps/web` dan streaming dari `apps/api`.

**Rekomendasi setup:**
- **WireGuard** — ringan, cepat, cocok untuk skala kecil ini (dibanding OpenVPN yang lebih berat overhead-nya)
- Server VPN bisa dijalankan di router (kalau mendukung WireGuard, misal router berbasis OpenWrt/pfSense) atau di PC/server yang sama dengan Mediaflow
- Setelah terhubung VPN, pengguna akses Mediaflow lewat **IP lokal** server (misal `http://192.168.1.10:3000`), bukan domain publik

**Implikasi ke desain sistem:**
- **Tidak perlu HTTPS/SSL certificate publik** (Let's Encrypt dll) untuk v1, karena traffic sudah terenkripsi lewat tunnel VPN. Kalau mau tetap pakai HTTPS di dalam VPN (defense in depth), bisa pakai self-signed certificate.
- **`CORS_ORIGIN`** cukup diarahkan ke IP lokal server (`http://192.168.1.10:3000`), bukan domain publik.
- **Cookie `secure` flag** tetap `false` selama akses lewat HTTP di jaringan lokal/VPN (kecuali kamu setup HTTPS internal).
- Tidak perlu strategi rate-limiting agresif seperti platform publik — 10-20 user dikenal semua (bukan traffic anonim dari internet).

---

## 14. Roadmap / Milestone Implementasi

| Milestone | Cakupan |
|---|---|
| **M1 — Fondasi Storage & Queue** | Setup Redis, MinIO, `apps/worker` dasar, konfigurasi BullMQ |
| **M2 — Upload Chunked** | Endpoint init/chunk/status/complete, hook `useChunkedUpload` di frontend, assembly file |
| **M3 — Transcoding Pipeline** | Worker konsumsi job, jalankan FFmpeg, generate HLS multi-bitrate, update status ke Postgres |
| **M4 — Playback** | Endpoint signed URL, integrasi HLS.js di frontend, halaman detail video |
| **M5 — Katalog & Riwayat** | List/search video, genre, watch history, resume playback |
| **M6 — Admin Panel** | Dashboard upload, monitoring status job, retry gagal, edit metadata |
| **M7 — Polish & Hardening** | Thumbnail otomatis, notifikasi status, rate limiting streaming, error handling menyeluruh |

---

## 15. Risiko & Pertanyaan Terbuka

| Risiko/Pertanyaan | Catatan |
|---|---|
| **PC/server lokal mati atau restart** | Karena single point of failure, perlu SOP jelas (misal PC tidak boleh sleep/hibernate, ada UPS untuk mati listrik mendadak) |
| **Kegagalan transcoding sebelum raw file dihapus** | Karena retensi raw = 0 (langsung hapus setelah sukses), pastikan penghapusan **hanya** terjadi setelah semua rendition benar-benar sukses tervalidasi — kalau terlalu dini, video sumber hilang permanen tanpa bisa re-transcode |
| **Kapasitas VPN & bandwidth rumah/kantor** | Kalau banyak user mengakses bersamaan lewat VPN dari luar, upload/download speed rumah jadi bottleneck (beda dengan cloud yang punya bandwidth besar) — perlu cek kecukupan bandwidth ISP untuk 10-20 user |
| FFmpeg transcoding time lama untuk video durasi panjang | Karena cuma 1 worker (tidak di-scale), transcoding video panjang bisa antre lama kalau banyak upload bersamaan — cukup diterima untuk skala 10-20 user, tapi perlu diinfokan ke admin lewat status job |
| Load testing belum ditentukan targetnya | Target sudah jelas: 10-20 concurrent viewer — perlu di-test benar bahwa 1 PC sanggup serve HLS ke jumlah ini bersamaan |
| Tidak ada backup otomatis untuk HLS output | Karena raw dihapus dan hanya HLS yang disimpan, pertimbangkan backup berkala folder `hls/` (external drive/NAS) supaya tidak kehilangan konten kalau disk lokal rusak |

---

## 16. Lampiran: Referensi Modul Auth yang Sudah Dibangun

Sistem ini melanjutkan fondasi autentikasi yang sudah selesai dibangun sebelumnya (lihat dokumentasi terpisah `issue.md`), mencakup:
- Register, login, refresh token (dengan rotation), logout, logout-all-device
- Middleware `requireAuth` untuk proteksi route
- Password hashing via `Bun.password` (argon2id)

Modul streaming ini akan menambahkan **role-based access** (membedakan `USER` biasa vs `ADMIN`) pada model `User` — detail skema migrasi role akan dibahas di issue implementasi terpisah.
