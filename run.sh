#!/usr/bin/env bash

# ==============================================================================
# Video Stitch Studio - One-Click Launcher for macOS / Linux
# ==============================================================================

set -e

# Add common local bin paths to PATH
export PATH="$HOME/.local/bin:$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

echo ""
echo "========================================================"
echo "      🎬 Video Stitch Studio (Desktop Suite)           "
echo "  2K Lossless Compressor & Instant Marathon Merger      "
echo "========================================================"
echo ""

# 1. Check FFmpeg and FFprobe
if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "❌ Error: FFmpeg tidak ditemukan di sistem PATH!"
    echo "   Silakan install FFmpeg terlebih dahulu:"
    echo "   macOS: brew install ffmpeg"
    echo "   Ubuntu/Debian: sudo apt update && sudo apt install -y ffmpeg"
    exit 1
fi

if ! command -v ffprobe >/dev/null 2>&1; then
    echo "❌ Error: FFprobe tidak ditemukan di sistem PATH!"
    exit 1
fi
echo "✅ FFmpeg & FFprobe terdeteksi."

# 2. Check Node & npm
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    echo "❌ Error: Node.js / npm tidak ditemukan!"
    echo "   Silakan install Node.js (v18+) dari https://nodejs.org/"
    exit 1
fi
echo "✅ Node.js & npm terdeteksi ($(node -v))."

# 3. Check or Install uv
UV_BIN=""
if command -v uv >/dev/null 2>&1; then
    UV_BIN="$(command -v uv)"
elif [ -x "$HOME/.local/bin/uv" ]; then
    UV_BIN="$HOME/.local/bin/uv"
elif [ -x "$HOME/.cargo/bin/uv" ]; then
    UV_BIN="$HOME/.cargo/bin/uv"
fi

if [ -z "$UV_BIN" ]; then
    echo "ℹ️  'uv' package manager belum ditemukan di PATH."
    echo "   Mengunduh dan memasang 'uv' secara otomatis..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
    if [ -x "$HOME/.local/bin/uv" ]; then
        UV_BIN="$HOME/.local/bin/uv"
    elif command -v uv >/dev/null 2>&1; then
        UV_BIN="$(command -v uv)"
    fi
fi

# Fallback if uv still unavailable
USE_PYTHON_VENV=0
if [ -z "$UV_BIN" ]; then
    echo "⚠️  uv gagal dipasang otomatis, menggunakan fallback python3 -m venv..."
    USE_PYTHON_VENV=1
else
    echo "✅ uv terdeteksi ($("$UV_BIN" --version))."
fi

# 4. Backend Setup
echo ""
echo "🚀 [1/3] Menyiapkan Backend Python..."
cd "$BACKEND_DIR"

if [ "$USE_PYTHON_VENV" -eq 1 ]; then
    if [ ! -d ".venv" ]; then
        python3 -m venv .venv
    fi
    source .venv/bin/activate
    pip install --upgrade pip
    pip install fastapi "uvicorn[standard]" websockets pydantic python-multipart
else
    # Use uv sync / uv venv
    if [ ! -d ".venv" ]; then
        "$UV_BIN" venv
    fi
    "$UV_BIN" pip install fastapi "uvicorn[standard]" websockets pydantic python-multipart
fi

# 5. Frontend Setup
echo ""
echo "🎨 [2/3] Menyiapkan Frontend (Vite + React)..."
cd "$FRONTEND_DIR"
if [ ! -d "node_modules" ]; then
    echo "   Menginstal dependensi frontend via npm..."
    npm install
fi

# Trap to kill background processes on exit
cleanup() {
    trap - SIGINT SIGTERM EXIT
    echo ""
    echo "🛑 Menghentikan Video Stitch Studio..."
    if [ -n "$BACKEND_PID" ]; then
        pkill -P "$BACKEND_PID" 2>/dev/null || true
        kill -TERM "$BACKEND_PID" 2>/dev/null || true
    fi
    if [ -n "$FRONTEND_PID" ]; then
        pkill -P "$FRONTEND_PID" 2>/dev/null || true
        kill -TERM "$FRONTEND_PID" 2>/dev/null || true
    fi
    # Wait briefly so child shutdown logs don't overwrite the shell prompt
    sleep 0.6
    echo "✅ Semua proses berhasil dihentikan."
    exit 0
}
trap cleanup SIGINT SIGTERM

# 6. Start Backend Server
echo ""
echo "⚡ [3/3] Menjalankan Server & UI..."
cd "$BACKEND_DIR"
if [ "$USE_PYTHON_VENV" -eq 1 ]; then
    uvicorn app:app --host 127.0.0.1 --port 8000 --reload &
    BACKEND_PID=$!
else
    "$UV_BIN" run uvicorn app:app --host 127.0.0.1 --port 8000 --reload &
    BACKEND_PID=$!
fi

# Start Frontend Dev Server
cd "$FRONTEND_DIR"
npm run dev -- --host 127.0.0.1 &
FRONTEND_PID=$!

# Wait for Backend and Frontend to be ready
echo "⏳ Menunggu backend dan frontend siap..."
BACKEND_READY=0
for i in {1..30}; do
    if curl -s http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
        BACKEND_READY=1
        break
    fi
    # Check if backend process died
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "❌ Backend gagal berjalan!"
        exit 1
    fi
    sleep 0.5
done

for i in {1..30}; do
    if curl -s http://127.0.0.1:5173 >/dev/null 2>&1; then
        break
    fi
    sleep 0.5
done

echo ""
echo "========================================================"
echo "  🎉 Video Stitch Studio Berhasil Dijalankan!           "
echo "  - Web UI: http://localhost:5173                       "
echo "  - API Backend: http://localhost:8000                  "
echo "  Tekan Ctrl+C di terminal ini untuk keluar.            "
echo "========================================================"
echo ""

# Auto open browser
if command -v open >/dev/null 2>&1; then
    open "http://localhost:5173"
elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:5173"
fi

# Keep script running
wait
