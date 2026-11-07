# Product Requirement Document (PRD)
## Video Stitch Studio (Desktop Suite)

---

## 1. Executive Summary & Problem Statement
### 1.1 Background
Kreator video recap (manhwa, anime, podcast, tutorial) secara rutin mengekspor video berdurasi panjang (~1 jam per bagian/batch episode) dari video editor seperti CapCut pada resolusi 2K (1440p). Hasil ekspor mentah ini menghasilkan file sangat besar (~10 GB/jam). Di minggu-minggu berikutnya, kreator perlu menggabungkan beberapa episode (misal Part 1 digabung dengan Part 2) menjadi video kompilasi/maraton tanpa kehilangan kualitas teks bacaan atau gambar dan tanpa memakan waktu rendering berjam-jam.

### 1.2 Objective
Membangun aplikasi desktop bernama **Video Stitch Studio** berbasis **Python Backend (uv + FastAPI + Uvicorn) + React/Tailwind UI** yang ringan, intuitif, dan cepat dengan:
1. **Kompresi Berkualitas Tinggi (Min. 2K Visually Lossless):** Mengurangi ukuran file dari ~10 GB menjadi ~1.5–2.5 GB per jam.
2. **Penggabungan Instan (Lossless Stream Copy Concat):** Menggabungkan video-video part yang sudah terstandarisasi hanya dalam **10–30 detik**.
3. **Cross-Platform Hardware Acceleration:** Berjalan optimal di **Apple Silicon M2 (Media Engine / VideoToolbox)** dan **Windows NVIDIA RTX 3060 (NVENC Gen 7)** dengan auto-detection.
4. **Desktop GUI Sederhana & Elegan:** Drag-and-drop file path picker, reorder urutan part video, preset default 2K terbaik, status progress bar & estimated time.
5. **One-Click Run:** Cukup jalankan `./run.sh` di Mac atau `run.bat` di Windows untuk setup virtual environment dan menjalankan frontend + backend secara simultan.

---

## 2. Target Users & System Environment
* **Target User:** Video Editor / Content Creator / Recap Creator (Single User, Desktop Focus).
* **Hardware Target:**
  * **macOS:** Apple Silicon M2, RAM 8GB.
  * **Windows:** PC Desktop/Laptop, Intel/AMD + NVIDIA RTX 3060 (12GB VRAM), RAM 16GB.
* **Core Dependencies:**
  * `ffmpeg` & `ffprobe` (terinstall dan terdaftar di System PATH).
  * `uv` (Ultra-fast Python package manager & resolver).
  * Python 3.10+ (managed via `uv`).
  * Node.js & npm (Frontend).

---

## 3. Core Architecture & Tech Stack

### 3.1 Tech Stack
* **Python Package Manager & Runner:** `uv` (Astral)
* **Backend Framework:** FastAPI running on `uvicorn` (REST API & WebSocket untuk real-time progress)
* **Video Engine:** FFmpeg & FFprobe CLI wrapper dengan dynamic hardware detection
* **Frontend:** React.js (Vite), Tailwind CSS, Lucide Icons, Drag & Drop (`react-dropzone` / HTML5 native DND)
* **Launcher Scripts:**
  * `run.sh` (macOS / Linux)
  * `run.bat` (Windows)

---

## 4. Key Functional Requirements

### 4.1 Auto-Detection Hardware Encoder
Backend Python wajib memeriksa lingkungan OS saat booting dan memilih encoder hardware terbaik:
| Platform | Hardware Encoder Codec | Audio Bitrate | Kecepatan Encoding |
| :--- | :--- | :--- | :--- |
| **macOS (M2)** | `hevc_videotoolbox` / `h264_videotoolbox` | AAC 192k | ~5–10 menit/jam |
| **Windows (RTX 3060)** | `hevc_nvenc` / `h264_nvenc` (Preset `p6`) | AAC 192k | ~4–8 menit/jam |
| **Fallback (CPU)** | `libx264` / `libx265` (CRF 22) | AAC 192k | ~30–60 menit/jam |

> **Catatan Default Codec:** Default menggunakan **H.264 High Quality** atau **H.265 (HEVC)** pada parameter minimum 2K (1440p) 30 FPS konstan agar kompatibilitas gabung instan terjamin 100%.

---

### 4.2 Pre-Check Validator (via `ffprobe`)
Sebelum video diproses (baik kompresi atau merge), sistem secara otomatis menjalankan validasi inspeksi metadata menggunakan `ffprobe`:
1. **Format & Codec Inspection:** Mengecek codec video (`h264`, `hevc`), resolusi (`width x height`), dan audio format.
2. **Compatibility Warning:**
   * Saat menggabungkan beberapa video di Tab Merge: jika resolusi (misal 2560x1440 vs 1920x1080) atau framerate (misal 30fps vs 60fps) berbeda, UI menampilkan badge peringatan kuning: *"Video memiliki perbedaan FPS/Resolusi. Disarankan melakukan standarisasi compress dulu atau merge akan menggunakan mode re-encode agar tidak desync"*.
3. **Integrity Check:** Memastikan file video tidak corrupt dan memiliki stream video + audio yang valid.

---

### 4.3 Auto-Naming Suggestion
Sistem memiliki logic parser otomatis untuk menamai file output agar user tidak perlu mengetik manual:
1. **Single Compress:** 
   * Input: `CapCut_Ch01-06_Export.mp4` $\rightarrow$ Saran Output: `Part1_Ch01-06_2K_Master.mp4`.
2. **Merge / Marathon:**
   * Mendeteksi pola angka chapter dari daftar file yang di-drop.
   * Contoh: Input `Ch01-06.mp4` dan `Ch07-12.mp4` $\rightarrow$ Saran Output otomatis: `Marathon_Ch01-12_2K.mp4`.
   * Input `Part 1.mp4`, `Part 2.mp4`, `Part 3.mp4` $\rightarrow$ Saran Output: `Marathon_Part1-Part3_2K.mp4`.
   * User tetap bisa mengedit nama output langsung di text field jika diinginkan.

---

### 4.4 Module 1: Single/Batch Part Compressor
* **Input:** File video mentah dari CapCut (.mp4 / .mov) via Drag-and-Drop.
* **Preset Default:**
  * Resolution: **2K (2560x1440)** (No Downscaling jika sumber 2K).
  * Framerate: **30 FPS (Constant Frame Rate)** untuk standarisasi concatenation.
  * Quality Slider / Level: Default **High Quality (Visually Lossless)**.
    * M2: Quality `65` (scale 0-100).
    * RTX 3060: Constant Quality `CQ 20`, Preset `p6`.
* **Output:** Standar master file `partX_compressed.mp4` (~1.5–2.5 GB).

---

### 4.5 Module 2: Instant Video Merger (Marathon Creator)
* **Input:** Multi-file selector via Drag-and-Drop dengan fitur **Re-order / Sortable List** (Part 1, Part 2, Part 3, dst).
* **Mode Operasi:**
  1. **Mode A: Instant Lossless Concat (Recommended):**
     * Menggunakan perintah FFmpeg `concat` dengan parameter `-c copy`.
     * Durasi: **10 – 30 detik**.
     * Beban CPU/GPU: 0% (Hanya I/O SSD Disk).
  2. **Mode B: Concat + Re-encode (Fallback):**
     * Dipilih otomatis jika resolusi/fps antar file tidak seragam.
* **Output:** Video gabungan maraton sesuai saran Auto-Naming.

---

## 5. UI/UX Specifications (React + Tailwind CSS)

### 5.1 Design Language
* **Style:** Modern Dark Mode (Slate / Zinc palette), clean typography, rounded cards, aksen Indigo/Violet atau Emerald.
* **Layout:** Desktop-only container (min-width: 1024px), tidak perlu responsive mobile.

### 5.2 Page Sections / Tabs
1. **Header:**
   * Judul Aplikasi: `Video Stitch Studio`.
   * Hardware Indicator Badge: `Detected: Apple M2 (VideoToolbox)` atau `Detected: NVIDIA RTX 3060 (NVENC)`.
2. **Tab 1: "Compress Single Part"**
   * Drag-and-drop zone lebar dengan ikon folder & file size preview.
   * Hasil inspect `ffprobe` (Resolusi sumber, FPS, bitrate asli).
   * Input nama file dengan rekomendasi **Auto-Naming**.
   * Preset selector: *Best for 2K Recap (Default)*, *Max Compression*, *Custom*.
   * Action button: *"Start Compress"*.
   * Progress modal / bar dengan FPS live, waktu berjalan, dan perkiraan sisa waktu (ETA).
3. **Tab 2: "Merge / Marathon Generator"**
   * Multi-file drop zone.
   * List item video yang bisa di-drag untuk ubah urutan (Up/Down arrow atau Drag Handle).
   * **Pre-Check Validator Status Bar:** Menampilkan indikator kesesuaian parameter video (Hijau = Siap Instant Copy; Kuning = Perlu Re-encode).
   * Input nama file maraton dengan rekomendasi **Auto-Naming**.
   * Info total durasi gabungan & estimasi ukuran akhir.
   * Tombol: *"⚡ Merge Instan (Lossless - ~15s)"*.
4. **Footer / Notification:**
   * Notifikasi suara / toast saat render selesai.
   * Tombol *"Open in Folder"* setelah selesai proses.

---

## 6. Project Structure & One-Click Runner Specification

### 6.1 Directory Layout
```text
video-stitch-studio/
├── backend/
│   ├── app.py             # FastAPI backend with Uvicorn server & WebSockets
│   ├── pyproject.toml     # uv dependencies config
│   └── engine/
│       ├── detector.py    # Auto-detect OS & GPU (M2 vs RTX 3060)
│       ├── probe.py       # ffprobe metadata inspector & validator
│       ├── naming.py      # Auto-naming heuristic logic
│       ├── compressor.py  # FFmpeg compression logic
│       └── merger.py      # FFmpeg concat logic (instant & fallback)
├── frontend/
│   ├── src/
│   │   ├── components/    # DropZone, VideoList, HardwareBadge, ProgressBar, PreCheckAlert
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.js
├── run.sh                 # One-click startup script for macOS
├── run.bat                # One-click startup script for Windows
└── PRD.md
```

### 6.2 One-Click Startup Script Behavior (`run.sh` & `run.bat`)
Saat dijalankan (double-click atau run via terminal):
1. **Cek Prasyarat:** Memeriksa ketersediaan `ffmpeg` dan `uv` (jika `uv` belum ada, berikan instruksi instalasi instan).
2. **Backend Setup:**
   * Menjalankan `uv sync` untuk menyiapkan virtualenv dan dependency Python secara otomatis.
   * Menjalankan server Uvicorn: `uv run uvicorn app:app --port 8000 --reload`.
3. **Frontend Setup:**
   * Menjalankan `npm install` (jika `node_modules` belum ada).
   * Menjalankan `npm run dev` (Vite dev server pada port 5173).
4. **Auto-Launch:** Otomatis membuka browser default ke `http://localhost:5173`.


### 6.2 One-Click Startup Script Behavior (`run.sh` & `run.bat`)
Saat dijalankan (double-click atau run via terminal):
1. **Cek Prasyarat:** Memeriksa ketersediaan `ffmpeg` dan `uv` (jika `uv` belum ada, berikan instruksi instalasi instan).
2. **Backend Setup:**
   * Menjalankan `uv sync` untuk menyiapkan virtualenv dan dependency Python secara otomatis.
   * Menjalankan server Uvicorn: `uv run uvicorn app:app --port 8000 --reload`.
3. **Frontend Setup:**
   * Menjalankan `npm install` (jika `node_modules` belum ada).
   * Menjalankan `npm run dev` (Vite dev server pada port 5173).
4. **Auto-Launch:** Otomatis membuka browser default ke `http://localhost:5173`.
