@echo off
setlocal enabledelayedexpansion

title Video Stitch Studio - Desktop Suite

echo ========================================================
echo       Video Stitch Studio (Desktop Suite)
echo   2K Lossless Compressor ^& Instant Marathon Merger
echo ========================================================
echo.

:: 1. Check FFmpeg
where ffmpeg >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] FFmpeg tidak ditemukan di PATH!
    echo Silakan unduh dan pasang FFmpeg dari https://ffmpeg.org/ atau via 'winget install Gyan.FFmpeg'
    pause
    exit /b 1
)

:: 2. Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js tidak ditemukan di PATH!
    echo Silakan unduh dan pasang Node.js dari https://nodejs.org/
    pause
    exit /b 1
)

:: 3. Setup Backend
echo [1/3] Menyiapkan Backend Python...
cd /d "%~dp0backend"

where uv >nul 2>nul
if %errorlevel% equ 0 (
    echo Menggunakan uv package manager...
    if not exist .venv (
        uv venv
    )
    uv pip install fastapi "uvicorn[standard]" websockets pydantic python-multipart
    set "RUN_BACKEND=uv run uvicorn app:app --host 127.0.0.1 --port 8000 --reload"
) else (
    echo uv tidak terdeteksi, menggunakan python default...
    if not exist .venv (
        python -m venv .venv
    )
    call .venv\Scripts\activate.bat
    python -m pip install --upgrade pip
    pip install fastapi "uvicorn[standard]" websockets pydantic python-multipart
    set "RUN_BACKEND=uvicorn app:app --host 127.0.0.1 --port 8000 --reload"
)

:: 4. Setup Frontend
echo.
echo [2/3] Menyiapkan Frontend (Vite + React)...
cd /d "%~dp0frontend"
if not exist node_modules (
    echo Menginstal dependensi frontend via npm...
    call npm install
)

:: 5. Launch Backend & Frontend
echo.
echo [3/3] Menjalankan Server & UI...

:: Start Backend in background window
start "Video Stitch Studio - Backend API" cmd /k "cd /d %~dp0backend && %RUN_BACKEND%"

:: Start Frontend dev server in background window
start "Video Stitch Studio - Frontend Dev" cmd /k "cd /d %~dp0frontend && npm run dev"

:: Wait 3 seconds then open browser
timeout /t 3 /nobreak >nul
start http://localhost:5173

echo.
echo ========================================================
echo   Video Stitch Studio Berhasil Dijalankan!
echo   - Web UI: http://localhost:5173
echo   - Backend API: http://localhost:8000
echo ========================================================
echo.
pause
