# 🎬 Video Stitch Studio (Desktop Suite)

> **Desktop Suite Khusus Kreator Video Recap:** Kompresi 2K Visually Lossless (~75% hemat storage) & Penggabungan Instan (Lossless Stream Copy Concat ~15 Detik) berbasis **FastAPI (Python) + React (Tailwind CSS) + FFmpeg Hardware Acceleration**.

---

## 🌟 Latar Belakang & Masalah yang Diselesaikan

Kreator video recap (manhwa, anime, tutorial, alur cerita) sering mengekspor video berdurasi panjang (~1 jam/part) dari editor seperti CapCut pada resolusi 2K (1440p). Hasil ekspor mentah menghasilkan file raksasa (~10 GB/jam). Ketika ingin menggabungkan Part 1 dan Part 2 menjadi video maraton/kompilasi, proses render ulang tradisional di software editing memakan waktu berjam-jam dan membebani GPU/CPU.

**Video Stitch Studio** memecahkan masalah ini dengan dua modul utama:
1. **Modul 1 (Kompresi Standar 2K Lossless):** Mengurangi ukuran file mentah dari **~10 GB menjadi ~1.5–2.5 GB** per jam tanpa penurunan kualitas teks atau gambar, distandarisasi ke **2560x1440 @ 30 FPS constant (CFR)**.
2. **Modul 2 (Penggabungan Instan ~15 Detik):** Menggabungkan video-video part yang sudah terstandarisasi menggunakan fitur **Stream Copy (`-c copy`)** FFmpeg hanya dalam **10–30 detik** dengan **0% beban CPU/GPU** (hanya I/O disk).

---

## ✨ Fitur Unggulan

* **🚀 Cross-Platform Hardware Acceleration (Auto-Detect):**
  * **macOS (Apple Silicon M1/M2/M3/M4):** Otomatis menggunakan hardware encoder `hevc_videotoolbox` / `h264_videotoolbox` dengan target quality 65 (kecepatan encoding ~5–10 menit/jam).
  * **Windows (NVIDIA RTX/GTX):** Otomatis menggunakan `hevc_nvenc` / `h264_nvenc` (Preset `p6`, Constant Quality `CQ 20`).
  * **CPU Fallback:** Otomatis fallback ke `libx264` / `libx265` jika hardware encoder tidak terpasang.
* **⚡ Penggabungan Instan (Lossless Concat):**
  * Mode A: Instant Concat Demuxer (`-c copy`) selesai dalam hitungan detik.
  * Mode B: Automatic Re-encode Fallback jika video memiliki perbedaan parameter resolusi/FPS.
* **🔍 Pre-Check Validator (`ffprobe`):**
  * Memeriksa metadata file (resolusi, framerate, codec, audio) secara real-time.
  * Menampilkan badge indikator visual:
    * 🟢 **Hijau (Siap Instant Copy):** Seluruh file memiliki resolusi, FPS, dan codec yang seragam.
    * 🟡 **Kuning (Perlu Re-encode):** Memberikan peringatan jika ada perbedaan spec antar part dan menawarkan standarisasi otomatis.
* **🏷️ Smart Auto-Naming Suggestion:**
  * Kompresi Tunggal: `CapCut_Ch01-06_Export.mp4` $\rightarrow$ `Part1_Ch01-06_2K_Master.mp4`.
  * Penggabungan Marathon: `Ch01-06.mp4` + `Ch07-12.mp4` $\rightarrow$ `Marathon_Ch01-12_2K.mp4`.
  * Multi-Part: `Part 1.mp4`, `Part 2.mp4`, `Part 3.mp4` $\rightarrow$ `Marathon_Part1-Part3_2K.mp4`.
* **🎨 Modern Desktop Dark Mode UI:**
  * Drag-and-drop file picker dengan integrasi native Finder/Explorer dialog (`osascript` di Mac & PowerShell di Windows).
  * Reorderable Part list dengan tombol navigasi naik/turun dan hapus.
  * Real-time progress bar (persentase, FPS live, waktu berjalan, ETA, dan kecepatan render).
  * Notifikasi suara audio chime saat render selesai dan tombol *"Buka di Folder (Finder/Explorer)"*.

---

## 🏗️ Arsitektur & Struktur Proyek

```text
video-stitch-studio/
├── backend/
│   ├── app.py             # FastAPI REST API & WebSocket server
│   ├── pyproject.toml     # uv / python package configuration
│   └── engine/
│       ├── detector.py    # Auto-detect OS & GPU (Apple M-Series vs NVIDIA NVENC)
│       ├── probe.py       # ffprobe metadata inspector & compatibility validator
│       ├── naming.py      # Heuristic parser auto-naming
│       ├── compressor.py  # FFmpeg compression engine dengan live progress
│       └── merger.py      # FFmpeg instant copy (-c copy) & re-encode merger
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── HardwareBadge.jsx   # Indikator chip hardware & encoder aktif
│   │   │   ├── DropZone.jsx        # Drag-and-drop & native file picker
│   │   │   ├── VideoList.jsx       # Reorderable list part video marathon
│   │   │   ├── PreCheckAlert.jsx   # Indikator kesesuaian parameter video
│   │   │   └── ProgressBar.jsx     # Live progress modal dengan ETA & audio chime
│   │   ├── App.jsx                 # Main application view & tab switcher
│   │   ├── main.jsx
│   │   └── index.css
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.js
├── tests/
│   └── test_pipeline.py   # Automated integration tests
├── run.sh                 # One-click startup script untuk macOS & Linux
├── run.bat                # One-click startup script untuk Windows
├── PRD.md                 # Product Requirement Document
└── README.md
```

---

## 📋 Prasyarat Sistem

Sebelum menjalankan aplikasi, pastikan sistem Anda memiliki:
1. **FFmpeg & FFprobe:** Terpasang dan terdaftar di System PATH.
   * **macOS:** `brew install ffmpeg`
   * **Windows:** `winget install Gyan.FFmpeg` atau unduh dari [ffmpeg.org](https://ffmpeg.org/)
   * **Linux:** `sudo apt update && sudo apt install -y ffmpeg`
2. **Node.js (v18+):** Unduh dari [nodejs.org](https://nodejs.org/)
3. **Python (3.10+)** atau **uv:**
   * Script `run.sh` dan `run.bat` akan otomatis mendeteksi `uv` atau membuat virtual environment Python.

---

## 🚀 Cara Menjalankan (One-Click Runner)

### 🍏 macOS / Linux
Cukup jalankan script launcher di terminal:
```bash
./run.sh
```
*Script ini akan:*
1. Memeriksa ketersediaan `ffmpeg`, `uv`, Python, dan Node.js.
2. Memasang virtual environment dan dependensi backend secara otomatis.
3. Menjalankan `npm install` untuk frontend.
4. Menjalankan server backend di port `8000` dan frontend Vite di port `5173`.
5. Membuka browser default secara otomatis ke `http://localhost:5173`.
6. Menangani shutdown bersih (Ctrl+C menghentikan semua server).

---

### 🪟 Windows
Double-click file `run.bat` atau jalankan via Command Prompt / PowerShell:
```cmd
run.bat
```
*Script ini akan menyiapkan virtual environment, menginstal library yang dibutuhkan, menjalankan backend dan frontend, lalu otomatis membuka browser.*

---

## 🧪 Menjalankan Pengujian Otomatis (Testing)

Untuk memverifikasi fungsi hardware detection, probe validator, auto-naming, kompresi 2K, dan instant merge:
```bash
# Jalankan test suite
backend/.venv/bin/python tests/test_pipeline.py
```

Output pengujian:
```text
=== TEST 1: Hardware Detection ===
OS: macOS, Device: Apple M2, Hardware Accel: True
Recommended Codec: hevc_videotoolbox

=== TEST 2: Probe & Validation ===
V1: 2560x1440 @ 30.0 FPS, h264, duration: 00:02
V2: 2560x1440 @ 30.0 FPS, h264, duration: 00:02
Validation: can_instant_copy=True, badge=ready

=== TEST 3: Auto-Naming Heuristics ===
Single suggested: Part1_Ch01-06_2K_Master.mp4
Merge suggested: Marathon_Ch01-12_2K.mp4

=== TEST 4: Compression Job (Hardware Accelerated) ===
Compress result: success=True

=== TEST 5: Instant Merge Job (Lossless Concat) ===
Merge result: success=True, mode=instant_copy
Merged output duration: 00:04

🎉 ALL PIPELINE TESTS PASSED SUCCESSFULLY! 🎉
```

---

## 🛠️ Panduan Penggunaan Aplikasi

### Modul 1: Kompresi Part Video (2K Lossless)
1. Buka tab **"MODUL 1: KOMPRESI PART VIDEO"**.
2. Tarik file hasil ekspor CapCut atau klik tombol **"Pilih File (Finder / Explorer)"**.
3. Sistem secara otomatis membaca resolusi, framerate, bitrate, dan ukuran file.
4. Pilih preset:
   * **Best for 2K Recap (Default):** 2560x1440 @ 30 FPS CFR dengan visual lossless quality.
   * **Max Compression:** Menghasilkan ukuran file lebih kecil untuk arsip hemat ruang.
   * **Custom Mode:** Memungkinkan penyesuaian manual resolusi, FPS, dan slider quality.
5. Periksa nama output yang disarankan oleh Auto-Naming (dapat diedit manual).
6. Klik **"START COMPRESS 2K"**. Monitor progress live FPS, sisa waktu (ETA), dan dengarkan suara notifikasi saat selesai!

---

### Modul 2: Penggabungan Instan (Marathon Concat ~15s)
1. Buka tab **"MODUL 2: PENGGABUNGAN INSTAN"**.
2. Tarik beberapa part video sekaligus (misal Part 1, Part 2, Part 3) atau gunakan native file picker.
3. Atur urutan part video menggunakan tombol panah atas/bawah jika urutan belum sesuai.
4. Perhatikan **Pre-Check Validator Status Bar**:
   * Jika hijau: siap **Instant Copy (`-c copy`)** dalam 10–30 detik!
   * Jika kuning: sistem mendeteksi perbedaan resolusi/FPS dan merekomendasikan mode re-encode terstandarisasi.
5. Periksa nama marathon yang disarankan otomatis (misal: `Marathon_Ch01-12_2K.mp4`).
6. Klik **"⚡ MERGE INSTAN"**. Video kompilasi selesai dalam hitungan detik tanpa membebani GPU/CPU!
7. Klik tombol **"Buka di Folder"** untuk langsung melihat file di Finder atau File Explorer.

---

## 📄 Lisensi
Dilisensikan di bawah lisensi MIT.
