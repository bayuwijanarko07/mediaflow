# Design — Mediaflow (UI/UX Flow, Design System, Komponen, Technical Design Decisions)

Dokumen ini melengkapi `architecture.md` (yang fokus ke backend/data flow) dengan fokus ke sisi **frontend**: bagaimana pengguna bergerak lewat produk, bahasa desain yang dipakai, inventori komponen, dan keputusan teknis di level UI.

---

## 1. UI/UX Flow

### 1.1 Peta Halaman (Sitemap)

```
Publik (belum login)
├── /login                     — form masuk
└── /register                  — form daftar

Terproteksi — Member (role USER, halaman yang RELEVAN & DIMAKSUDKAN untuk mereka)
├── /                          — beranda: Continue Watching, Trending
├── /videos                    — katalog + search + filter genre
└── /videos/[id]                — detail + player HLS

Terproteksi — Admin only (role ADMIN)
├── /admin/upload               — form upload video baru (chunked)
├── /admin/videos                — dashboard: list semua video + status transcoding
├── /admin/videos/[id]           — status ringkas 1 video (masih placeholder)
└── /admin/videos/[id]/edit      — edit metadata (judul/deskripsi/genre)
```

> **Perbaikan route flow untuk member (sudah diimplementasikan):** Sebelumnya route member tercampur dengan admin di kategori "USER/ADMIN" yang sama, dan `ProtectedRoute` hanya mengecek **sudah login atau belum**, bukan role — member yang tahu/menebak URL `/admin/upload` bisa membuka & mengisi form admin, baru gagal saat submit (`403 Forbidden` dari `requireAdmin`).
>
> **Perbaikan:** komponen baru `RequireAdmin` (`app/components/auth/RequireAdmin.tsx`) menggantikan `ProtectedRoute` di keempat halaman `/admin/*`. Bedanya dengan `ProtectedRoute`:
> - Belum login → tetap redirect ke `/login?redirect=<pathname>` (sama seperti sebelumnya).
> - **Sudah login tapi `user.role !== "ADMIN"`** → langsung `router.replace("/")`, halaman admin tidak pernah ter-render sama sekali ke member (dicegah lewat kondisi render, bukan cuma `useEffect`, supaya tidak ada flash konten).
> - Baru render `children` kalau `role === "ADMIN"`.
>
> Ini murni perbaikan navigasi/UX di frontend — **enforcement keamanan sesungguhnya tetap di `requireAdmin` middleware backend** (`apps/api`), yang tidak berubah. `RequireAdmin` hanya mencegah member "nyasar" mengisi form yang toh akan ditolak. File terkait: `RequireAdmin.tsx`, `RequireAdmin.test.tsx`, dan keempat halaman di bawah `apps/web/app/admin/` sudah diupdate untuk memakainya.

### 1.2 Alur Rute End-to-End untuk Member (Perbaikan)

Diagram berikut adalah **satu alur utuh** perjalanan seorang member, dari belum punya akun sampai menonton dan logout — menggantikan potongan-potongan flow yang sebelumnya terpisah tanpa gambaran keseluruhan.

```
                         ┌─────────────────────────┐
                         │   Pengguna baru buka /   │
                         └────────────┬────────────┘
                                      │
                     ProtectedRoute: isAuthenticated? ──── ya ──────────────┐
                                      │ tidak                               │
                                      ▼                                    │
                    router.replace("/login?redirect=%2F")                  │
                                      │                                    │
                                      ▼                                    │
                              ┌───────────────┐                            │
                              │    /login     │◀── link "Belum punya akun?"│
                              └───────┬───────┘         → /register        │
                                      │                        │           │
                     belum punya akun?│                        ▼           │
                                      │              ┌───────────────────┐ │
                                      │              │     /register     │ │
                                      │              │ - email, password │ │
                                      │              │ - (nama opsional) │ │
                                      │              └─────────┬─────────┘ │
                                      │                        │ sukses    │
                                      │                        ▼           │
                                      │◀───── router.push("/login") ───────┤
                                      │        (TIDAK auto-login;          │
                                      │         member harus login manual  │
                                      │         setelah daftar)            │
                                      ▼                                    │
                       isi email + password → submit                      │
                                      │                                    │
                        ┌─────────────┴─────────────┐                     │
                     gagal                        sukses                  │
                        │                             │                    │
              banner error merah,           accessToken (memory) +        │
              tetap di /login               refresh_token (cookie) diset  │
                                                       │                    │
                              router.push(redirectParam ?? "/") ───────────┘
                                                       │
                                                       ▼
                                          ┌─────────────────────────┐
                                          │      "/" — Beranda      │
                                          │  - Continue Watching     │
                                          │  - Trending               │
                                          │  - link "Lihat semua     │
                                          │     video →" ke /videos  │
                                          └────────────┬─────────────┘
                                                       │
                       ┌───────────────────────────────┼───────────────────────────────┐
                       ▼                               ▼                               ▼
             klik video di Continue          klik video di Trending           klik "Lihat semua video"
             Watching (jump langsung                  │                               │
             ke video itu)                             │                               ▼
                       │                               │                     ┌───────────────────┐
                       │                               │                     │      /videos       │
                       │                               │                     │  search (debounce  │
                       │                               │                     │  400ms) + filter    │
                       │                               │                     │  genre + pagination │
                       │                               │                     └──────────┬──────────┘
                       │                               │                                │ klik VideoCard
                       └───────────────┬───────────────┴────────────────────────────────┘
                                       ▼
                            ┌───────────────────────┐
                            │    /videos/[id]         │
                            │  - metadata video        │
                            │  - init playback session  │
                            │    (viewCount +1, sekali)  │
                            │  - resume dari watch-       │
                            │    history kalau ada         │
                            │  - player HLS.js/native       │
                            │  - kirim watch-progress         │
                            │    tiap ~15 detik                │
                            └────────────┬─────────────────────┘
                                        │
                     video selesai / user pindah halaman
                                        │
                                        ▼
                          balik ke "/" → video ini kini
                          muncul di Continue Watching (kalau
                          belum ≥95% durasi) atau HILANG dari
                          situ (kalau sudah dianggap completed)
                                        │
                                        ▼
                              klik tombol Logout
                                        │
                                        ▼
                    POST /auth/logout (best-effort, selalu lanjut)
                                        │
                                        ▼
                        clear accessToken + user → router.push("/login")
```

**Titik-titik perbaikan yang ditambahkan pada alur ini dibanding sebelumnya:**
1. **Redirect-back eksplisit digambar penuh** — kalau member mengetik langsung `/videos/[id]` tanpa login, `ProtectedRoute` menyimpan `redirect=%2Fvideos%2F<id>` di query `/login`, dan setelah login sukses `LoginForm` membaca `searchParams.get("redirect")` untuk balik ke halaman yang **benar-benar dituju**, bukan selalu ke `/`.
2. **Register tidak auto-login** ditegaskan sebagai bagian dari alur (bukan detail tersembunyi) — member **wajib** login manual sekali setelah daftar; ini keputusan produk yang perlu terlihat jelas di dokumentasi flow supaya tidak dianggap bug saat QA.
3. **Loop Continue Watching ↔ Detail Video** digambar sebagai siklus (nonton → balik ke beranda → video hilang/tetap muncul tergantung status `completed`), bukan flow satu arah — ini pola pemakaian yang sebenarnya paling sering dilakukan member.
4. **Tidak ada jalur member menuju `/admin/*`** di diagram ini sama sekali — sesuai §1.1, ini memang bukan bagian dari perjalanan member yang valid.

### 1.3 Flow: Autentikasi (Detail Per Langkah)

```
[Landing "/"]
   user belum login → tampil "Silakan login untuk melanjutkan" + link ke /login
        │
        ▼
   [/login]
     - isi email + password
     - validasi client-side dulu (email wajib & format, password wajib)
     - submit → AuthContext.login()
        │
        ├─ gagal → tampilkan serverError di banner merah, form tetap terisi
        │
        └─ sukses → redirect ke ?redirect=... (kalau ada, dari ProtectedRoute)
                     atau ke "/" sebagai default
```

**Flow proteksi halaman (ProtectedRoute):**
```
Mount komponen
   │
   ▼
isLoading? ──yes──> tampilkan spinner "Memuat..." (JANGAN redirect dulu,
   │                 supaya tidak salah redirect saat status auth masih
   │                 di-restore dari /auth/refresh saat page reload)
   no
   │
   ▼
isAuthenticated? ──no──> router.replace("/login?redirect=<pathname>")
   │                      (redirect, bukan push — supaya back button
   yes                     tidak balik ke halaman protected kosong)
   │
   ▼
render children
```

**Flow resume sesi saat reload halaman:**
```
App mount → AuthProvider useEffect → POST /auth/refresh (pakai cookie)
   │
   ├─ sukses → set user + accessToken di memory → isLoading=false
   └─ gagal (401 / network error) → anggap belum login, TANPA error visual
        yang mengganggu (silent fail, user cukup lihat tombol "Masuk")
```

### 1.4 Flow: Katalog & Pencarian Video

```
[/videos]
  mount → fetch daftar genre (untuk chip filter) + fetch halaman 1 video
     │
     ▼
  user ketik di search box
     │
     ▼
  debounce 400ms (useDebouncedValue) — supaya tidak fetch tiap keystroke
     │
     ▼
  page di-reset ke 1 otomatis (search/genre baru = hasil baru,
  jangan "nyangkut" di halaman kosong dari filter sebelumnya)
     │
     ▼
  fetch ulang /videos?search=...&genre=...&page=1
     │
     ├─ ada hasil → render grid VideoCard (2–5 kolom responsif)
     └─ kosong    → pesan "Tidak ada video ditemukan"
```

Pagination: tombol "Sebelumnya"/"Berikutnya" di-disable otomatis di batas halaman pertama/terakhir; hanya muncul kalau `totalPages > 1`.

### 1.5 Flow: Playback

```
[/videos/[id]]
  mount → GET /videos/:id (metadata)
        → GET /videos/:id/playback (init sesi, increment viewCount SEKALI)
        → GET /me/watch-history (best-effort — kalau gagal, mulai dari detik 0)
     │
     ▼
  VideoPlayer terima masterPlaylistPath + initialPositionSec
     │
     ├─ Chrome/Firefox/Edge → HLS.js, xhrSetup sisipkan Authorization header
     │    ke SETIAP request (playlist & tiap segment .ts)
     └─ Safari                → native <video>, fetch manual + Authorization
                                  header, lalu jadikan blob URL

  saat play → currentTime otomatis di-set ke initialPositionSec (resume)
  saat nonton → tiap ~15 detik kirim POST /videos/:id/watch-progress
              (throttled dari event timeupdate, BUKAN tiap frame)

  Error handling HLS.js:
     NETWORK_ERROR → tampil pesan, auto hls.startLoad() (retry)
     MEDIA_ERROR   → tampil pesan, auto hls.recoverMediaError()
     lainnya       → pesan generik, hls.destroy() (berhenti total)
```

### 1.6 Flow: Upload Video (Admin)

```
[/admin/upload]
  pilih file → validasi client-side (format .mp4/.mov/.mkv, size ≤ MAX_GB,
               tidak boleh 0 byte)
     │
     ▼
  cek localStorage/sessionStorage: ada sesi upload lama untuk file
  DENGAN NAMA & UKURAN SAMA yang belum selesai?
     │
     ├─ ADA  → tampil banner kuning: "Lanjutkan Upload" / "Mulai Ulang"
     └─ TIDAK → langsung tombol "Mulai Upload"
     │
     ▼
  isi judul (wajib) + deskripsi (opsional) + pilih genre (multi-select chip)
     │
     ▼
  submit → status berubah: initializing → uploading → completing → success
     │
     ├─ uploading: progress bar real-time "chunk X/Y (Z%)",
     │             chunk dikirim PARALEL terbatas (3 sekaligus),
     │             retry otomatis per-chunk (maks 3x) kalau gagal
     │
     ├─ error di titik manapun → banner merah dengan pesan spesifik,
     │             sesi tersimpan di sessionStorage untuk di-resume nanti
     │
     └─ success → pesan "✅ Upload selesai!" → auto-redirect ke
                  /admin/videos/[id] setelah 1.5 detik (jeda sengaja,
                  supaya user sempat lihat konfirmasi)
```

### 1.7 Flow: Dashboard Admin (Monitoring & Aksi)

```
[/admin/videos]
  filter chip status (Semua/UPLOADING/.../FAILED)
     │
     ▼
  polling GET /videos/admin setiap 5 detik (useAdminVideos)
     - progress bar transcoding hanya tampil kalau status=PROCESSING
     - baris FAILED menampilkan errorMessage + tombol "Retry"
     - polling berhenti otomatis saat komponen unmount
     │
     ▼
  aksi per baris:
    Retry  → POST /videos/admin/:id/retry  → refetch list
    Edit   → navigasi ke /admin/videos/[id]/edit
    Hapus  → window.confirm() dulu (native browser confirm, bukan modal
              custom — sengaja sederhana untuk aksi destruktif) →
              DELETE /videos/admin/:id → refetch list
```

### 1.8 Flow: Logout

```
Klik tombol Logout → disable tombol (state "Keluar...")
   │
   ▼
POST /auth/logout (best-effort)
   │
   ▼ (SELALU jalan, baik API sukses maupun gagal)
router.push("/login")
```
Keputusan sengaja: dari sudut pandang user, klik logout **harus** selalu mengeluarkan mereka dari halaman protected, walau request API gagal (network error dll).

---

## 2. Design System

### 2.1 Filosofi
UI dibangun minimal & fungsional (bukan produk konsumer besar) — cocok untuk tool internal 10–20 pengguna. Prioritas: kejelasan status (banyak state async: loading/error/empty/success) di atas keindahan visual. Styling dilakukan **utility-first** langsung di JSX (Tailwind), tanpa layer komponen UI library terpisah (tidak ada shadcn/MUI dll).

### 2.2 Warna

| Peran | Kelas Tailwind | Konteks pemakaian |
|---|---|---|
| Primer / aksi utama | `bg-blue-600` / `hover:bg-blue-700` | Tombol submit, link aktif, chip terpilih |
| Destruktif | `bg-red-600` / `hover:bg-red-700` | Tombol Logout, tombol Hapus |
| Peringatan | `bg-yellow-600`, `bg-yellow-50` border `yellow-200` | Tombol Retry, banner "upload sebelumnya belum selesai" |
| Sukses (implisit) | teks `text-green-700` | Notifikasi ✅ upload sukses |
| Error | `bg-red-100 text-red-700` (banner), `text-red-500` (pesan validasi inline) | Semua pesan error form & server |
| Netral/permukaan | `bg-white`, `bg-gray-100`, `bg-gray-50` | Card, background halaman |
| Teks | `text-gray-800` (judul), `text-gray-600` (label/body), `text-gray-500` (meta/caption), `text-gray-400` (disabled/placeholder state) | Hierarki tipografi lewat kegelapan abu-abu |
| Disabled | `disabled:bg-gray-400 disabled:cursor-not-allowed disabled:opacity-40` | Semua tombol saat state loading/invalid |

**Status badge** (`StatusBadge.tsx`) — satu-satunya tempat mapping warna↔status video, dipakai konsisten di dashboard admin:

| Status | Kelas |
|---|---|
| UPLOADING / UPLOADED | `bg-gray-100 text-gray-700` |
| QUEUED | `bg-yellow-100 text-yellow-700` |
| PROCESSING | `bg-blue-100 text-blue-700` |
| READY | `bg-green-100 text-green-700` |
| FAILED | `bg-red-100 text-red-700` |

### 2.3 Tipografi
- Font: default `Arial, Helvetica, sans-serif` (via `globals.css`), belum pakai custom font (Geist dikonfigurasi di `layout.tsx` metadata tapi tidak di-load eksplisit).
- Skala: `text-2xl font-bold` (judul halaman/card auth) → `text-xl font-semibold` (judul section: Trending, Lanjutkan Menonton) → `text-sm font-medium` (label form, judul video card) → `text-xs` (meta info: durasi, view count, timestamp).

### 2.4 Spacing & Layout
- Container utama: `max-w-md` (form auth), `max-w-xl` (form edit/upload), `max-w-4xl` (detail video), `max-w-6xl` (katalog/dashboard) — lebar container membesar sesuai densitas konten.
- Padding konsisten: `p-6` untuk card/section utama, `px-3 py-2` untuk input, `px-4 py-2` untuk tombol.
- Radius: `rounded` (input/tombol kecil), `rounded-lg` (card), `rounded-full` (chip/badge/pill filter).
- Shadow: `shadow` pada card form auth; `hover:shadow-md` pada VideoCard (micro-interaction saat hover).

### 2.5 Grid Responsif (Video Grid)
```
grid-cols-2            (mobile)
sm:grid-cols-3
md:grid-cols-4
lg:grid-cols-5          (desktop lebar)
gap-4
```
Dipakai identik di `VideoGrid`, `TrendingSection` — satu pola grid untuk semua daftar video demi konsistensi visual.

### 2.6 Pola Komponen Berulang

**Form pattern** (dipakai di LoginForm, RegisterForm, UploadForm, EditVideoPage):
```
<div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow">
  <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">...</h1>
  {serverError && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">...</div>}
  <form className="space-y-4" noValidate>
    <div>
      <label className="block text-sm font-medium mb-1 text-gray-600">...</label>
      <input className="w-full px-3 py-2 border text-gray-600 border-gray-300 rounded
                         focus:outline-none focus:ring-2 focus:ring-blue-500" />
      {errors.field && <p className="text-red-500 text-sm mt-1">...</p>}
    </div>
    <button className="w-full px-4 py-2 bg-blue-600 text-white rounded
                        hover:bg-blue-700 disabled:bg-gray-400">
      {isLoading ? "..." : "Label"}
    </button>
  </form>
</div>
```
`noValidate` selalu dipakai di `<form>` — validasi native browser dimatikan, sepenuhnya digantikan validasi custom JS supaya pesan error konsisten bahasa Indonesia & styling seragam.

**Chip/Pill filter pattern** (genre filter, status filter admin):
```
selected: "bg-blue-600 text-white border-blue-600"
default:  "bg-white text-gray-700 border-gray-300"
```

**Loading state pattern**: teks abu-abu center (`text-gray-500 text-center py-12`) untuk loading list; spinner border-animasi (`border-4 border-blue-600 border-t-transparent rounded-full animate-spin`) untuk loading halaman penuh/player.

**Empty state pattern**: pesan sederhana di tengah, tanpa ilustrasi, dengan opsi `emptyMessage` custom (VideoGrid) untuk membedakan "belum ada video" vs "hasil pencarian kosong".

---

## 3. Inventori Komponen

```
app/components/
├── auth/
│   ├── LoginForm          — form login + validasi + link ke register
│   ├── RegisterForm        — form register + validasi + link ke login
│   ├── LogoutButton        — tombol reusable (className/children bisa dioverride)
│   └── ProtectedRoute      — guard: loading/redirect/render children
│
├── video/
│   ├── VideoGrid           — wrapper grid + empty state (dipakai katalog & trending)
│   ├── VideoCard            — thumbnail + judul + durasi + view count + genre
│   ├── GenreFilter          — search input + chip genre (fetch /genres sendiri)
│   ├── VideoPlayer          — HLS.js/native video + auth header injection + resume + progress report
│   ├── UploadForm           — form upload lengkap (file, metadata, genre, progress, resume)
│   ├── ContinueWatchingSection — horizontal scroll, hanya video belum completed
│   └── TrendingSection      — grid video urut viewCount (self-fetching)
│
└── admin/
    └── StatusBadge          — badge warna per VideoStatus (single source of truth warna status)
```

**Prinsip desain komponen yang konsisten di codebase:**
1. **Self-fetching sections** (`ContinueWatchingSection`, `TrendingSection`, `GenreFilter`) — komponen mengambil datanya sendiri lewat `useEffect`, bukan menerima data via props dari parent. Trade-off: parent (`page.tsx`) tetap ringkas, tapi komponen jadi tidak reusable untuk data sumber lain. Cocok untuk skala aplikasi ini (bukan design system besar).
2. **Controlled input dari parent** untuk komponen yang butuh sinkronisasi state lintas komponen — `GenreFilter` menerima `searchValue`/`onSearchChange`/`selectedGenre`/`onGenreChange` sebagai props (bukan self-managed), karena parent (`VideosCatalogPage`) perlu tahu nilainya untuk trigger fetch katalog.
3. **`emptyMessage` sebagai prop opsional** di `VideoGrid` — komponen dasar generik, teks pesan kosong disesuaikan per konteks pemanggil.
4. **Client Component eksplisit (`"use client"`)** di semua komponen interaktif; halaman Server Component murni (`RegisterPage`, `LoginPage`) hanya membungkus komponen client, memungkinkan metadata (`title`) tetap didefinisikan di level Server Component.

---

## 4. Technical Design Decisions (Frontend)

### 4.1 State management: React Context + module-level store, tanpa library eksternal
Tidak ada Redux/Zustand/Jotai. `AuthContext` (React Context) menyimpan `user`/`accessToken`/`isLoading` untuk keperluan render, sementara `token-store.ts` (variable module-level biasa) menyimpan **salinan** access token supaya `api-client.ts` (fungsi non-React, dipanggil dari hook maupun dari luar komponen) bisa membaca token terkini tanpa `useContext`. `AuthContext` bertanggung jawab menyinkronkan kedua tempat ini setiap kali token berubah (`setAccessToken` wrapper).

*Alasan:* skala aplikasi tidak butuh state management kompleks; masalah nyatanya murni "bagaimana kode non-React mengakses state React" — diselesaikan dengan store sederhana, bukan library tambahan.

### 4.2 Auto-refresh token yang di-dedupe
`api-client.ts` men-dedupe refresh call: kalau beberapa request 401 datang hampir bersamaan (mis. beberapa `<img>` atau fetch paralel), hanya **satu** panggilan `/auth/refresh` yang benar-benar jalan (`refreshPromise` di-share), sisanya menunggu promise yang sama. Setelah refresh sukses, request asli di-retry **maksimal sekali** — tidak ada retry berantai yang bisa menyebabkan loop.

`skipAuthRetry: true` dipakai eksplisit di endpoint `/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout` sendiri — mencegah infinite loop kalau refresh-nya sendiri yang gagal dengan 401.

### 4.3 Debounce search, bukan throttle
`useDebouncedValue` (generic hook, 400ms) dipakai untuk search box katalog — memilih **debounce** (tunggu jeda ketik berhenti) bukan throttle, karena tujuannya mengurangi jumlah request ke minimum yang relevan (hasil akhir ketikan), bukan membatasi rate selama user masih mengetik.

### 4.4 Reset pagination otomatis saat filter berubah
`useEffect` terpisah men-set `page = 1` setiap kali `debouncedSearch` atau `genre` berubah — mencegah state "nyangkut" di halaman 3 misalnya, padahal hasil filter baru cuma punya 1 halaman.

### 4.5 Resume upload: kombinasi `sessionStorage` (metadata) + endpoint backend (source of truth)
`uploadPersistence.ts` menyimpan metadata upload (uploadId, nama file, ukuran, chunkSize) ke `sessionStorage` — **bukan** untuk menyimpan progress aktualnya (karena `File` object tidak bisa di-serialize dan tidak persist antar reload), melainkan sekadar "petunjuk" bahwa ada sesi yang mungkin bisa dilanjutkan. Progress **sesungguhnya** (chunk mana yang sudah diterima) selalu diverifikasi ulang lewat `GET /upload/:id/status` ke backend — `sessionStorage` tidak pernah dipercaya sebagai sumber kebenaran, hanya sebagai referensi awal. Validasi tambahan: file yang dipilih ulang harus cocok **nama DAN ukuran** dengan yang tersimpan sebelum opsi resume ditawarkan.

### 4.6 Upload paralel terbatas, bukan sekuensial murni atau semua sekaligus
`MAX_PARALLEL_UPLOADS = 3` — kompromi antara throughput (lebih cepat dari sekuensial) dan tidak membanjiri server 1-PC dengan request bersamaan tak terbatas. Tiap chunk juga punya retry independen (`MAX_RETRIES_PER_CHUNK = 3`, backoff linear `attempt * 1000ms`) — kegagalan 1 chunk tidak menggagalkan seluruh batch.

### 4.7 Autentikasi HLS.js via `xhrSetup`, bukan cookie/query param
Karena endpoint playback (`/videos/:id/playback/*`) protected oleh `requireAuth` (Bearer token, bukan cookie session), HLS.js dikonfigurasi dengan `xhrSetup` callback yang menyisipkan `Authorization: Bearer <token>` ke **setiap** request internal library (baik playlist maupun tiap segment `.ts`). Untuk Safari (native HLS, tidak lewat HLS.js dan tidak bisa attach header custom ke `<video src>`), dipakai workaround: fetch manual dengan header lalu konversi ke `blob:` URL untuk playlist awal — trade-off yang diterima untuk skala proyek ini (disebutkan eksplisit di komentar kode sebagai keterbatasan).

### 4.8 Progress watch-time: throttled di level event, bukan di level network
Event `timeupdate` HTML5 video fire sangat sering (beberapa kali per detik). `VideoPlayer` men-throttle secara manual di dalam handler (`Math.abs(current - lastReported) >= 15`) sebelum memanggil `onTimeUpdate` — bukan mengandalkan debounce di layer network. Ini memastikan tidak ada request `watch-progress` terkirim kecuali benar-benar sudah lewat ~15 detik playback, tanpa jeda tambahan dari debounce timer.

### 4.9 Error boundary manual per fitur, bukan Error Boundary React global
Tidak ada `<ErrorBoundary>` React di level app. Setiap fetch dibungkus try/catch lokal dengan fallback state (`errorMessage`, array kosong, dst) — pola yang konsisten: kegagalan 1 section (mis. `TrendingSection` gagal fetch) tidak boleh merusak render bagian lain halaman (`ContinueWatchingSection`, dsb tetap render independen).

### 4.10 Testing strategy frontend
- `bun:test` + `@testing-library/react` + `happy-dom` (bukan jsdom) sebagai DOM environment, di-register lewat `bunfig.toml` preload.
- `mock.module()` dipakai luas untuk mock `next/navigation` dan `AuthContext` per test — komponen di-test terisolasi dari routing/auth context sungguhan.
- Pola test: render → `within(container)` → interaksi (`fireEvent`) → assert lewat `waitFor` untuk state asinkron. Tidak ada snapshot testing — semua assertion eksplisit terhadap teks/atribut yang terlihat user (mendekati pengujian dari sudut pandang pengguna, bukan implementasi internal).

### 4.11 Konfirmasi aksi destruktif native, bukan modal custom
Hapus video di dashboard admin memakai `window.confirm()` bawaan browser, bukan komponen modal kustom. Keputusan sadar mengurangi kompleksitas untuk tool internal skala kecil — trade-off: UX kurang mulus dibanding modal branded, tapi cukup untuk mencegah klik tidak sengaja tanpa menambah state/komponen baru.

---

## 5. Hal yang Belum Ada (Gap Diketahui di UI saat ini)

- Belum ada dark mode aktif (variabel `--background`/`--foreground` untuk `prefers-color-scheme: dark` sudah didefinisikan di `globals.css`, tapi belum dipakai konsisten oleh komponen berwarna eksplisit seperti `bg-white`/`text-gray-800`).
- Belum ada halaman 404/error kustom.
- `/admin/videos/[id]/page.tsx` (halaman status video tunggal) masih placeholder statis (`"QUEUED"` hardcoded) — progress real-time untuk halaman ini belum diimplementasi, saat ini hanya tersedia di dashboard list (`/admin/videos`) lewat polling.