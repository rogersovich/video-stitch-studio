# ==============================================================================
# Video Stitch Studio - One-Click Launcher for Windows PowerShell
# ==============================================================================

$ErrorActionPreference = "Stop"

$ProjectDir = $PSScriptRoot
$BackendDir = Join-Path $ProjectDir "backend"
$FrontendDir = Join-Path $ProjectDir "frontend"

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "       Video Stitch Studio (Desktop Suite)             " -ForegroundColor Cyan
Write-Host "  2K Lossless Compressor & Instant Marathon Merger      " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check FFmpeg & FFprobe
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] FFmpeg tidak ditemukan di PATH!" -ForegroundColor Red
    Write-Host "Silakan unduh dan pasang FFmpeg atau jalankan: winget install Gyan.FFmpeg" -ForegroundColor Yellow
    exit 1
}

if (-not (Get-Command ffprobe -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] FFprobe tidak ditemukan di PATH!" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] FFmpeg & FFprobe terdeteksi." -ForegroundColor Green

# 2. Check Node.js & npm
if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js / npm tidak ditemukan!" -ForegroundColor Red
    Write-Host "Silakan pasang Node.js dari https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}
$nodeVer = node -v
Write-Host "[OK] Node.js & npm terdeteksi ($nodeVer)." -ForegroundColor Green

# 3. Check Python or uv
$hasUv = [bool](Get-Command uv -ErrorAction SilentlyContinue)

# 4. Backend Setup
Write-Host ""
Write-Host ">> [1/3] Menyiapkan Backend Python..." -ForegroundColor Cyan
Set-Location $BackendDir

$backendCmd = ""
if ($hasUv) {
    Write-Host "Menggunakan uv package manager..." -ForegroundColor Gray
    if (-not (Test-Path ".venv")) {
        uv venv
    }
    uv pip install fastapi "uvicorn[standard]" websockets pydantic python-multipart | Out-Null
    $pyVenv = Join-Path $BackendDir ".venv\Scripts\python.exe"
    $backendCmd = "$pyVenv -m uvicorn app:app --host 127.0.0.1 --port 8000"
} else {
    Write-Host "uv tidak ditemukan, menggunakan python bawaan..." -ForegroundColor Gray
    if (-not (Test-Path ".venv")) {
        python -m venv .venv
    }
    $pyVenv = Join-Path $BackendDir ".venv\Scripts\python.exe"
    & $pyVenv -m pip install --upgrade pip | Out-Null
    & $pyVenv -m pip install fastapi "uvicorn[standard]" websockets pydantic python-multipart | Out-Null
    $backendCmd = "$pyVenv -m uvicorn app:app --host 127.0.0.1 --port 8000"
}

# 5. Frontend Setup
Write-Host ""
Write-Host ">> [2/3] Menyiapkan Frontend (Vite + React)..." -ForegroundColor Cyan
Set-Location $FrontendDir
if (-not (Test-Path "node_modules")) {
    Write-Host "Menginstal dependensi frontend via npm..." -ForegroundColor Gray
    npm install | Out-Null
}

# 6. Launch Servers
Write-Host ""
Write-Host ">> [3/3] Menjalankan Server & UI..." -ForegroundColor Cyan

# Free ports 8000 & 5173 if previously occupied
Get-NetTCPConnection -LocalPort 8000, 5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}

# Start Backend Process
$backendProc = Start-Process -FilePath "powershell.exe" -ArgumentList "-NoLogo", "-NoProfile", "-Command", "Set-Location '$BackendDir'; $backendCmd" -PassThru -WindowStyle Hidden

# Start Frontend Process
$frontendProc = Start-Process -FilePath "powershell.exe" -ArgumentList "-NoLogo", "-NoProfile", "-Command", "Set-Location '$FrontendDir'; npm run dev -- --host 127.0.0.1" -PassThru -WindowStyle Hidden

# Function to clean up child processes
function Cleanup-Processes {
    Write-Host ""
    Write-Host "[STOP] Menghentikan Video Stitch Studio..." -ForegroundColor Yellow
    if ($backendProc -and -not $backendProc.HasExited) {
        Stop-Process -Id $backendProc.Id -Force -ErrorAction SilentlyContinue
    }
    if ($frontendProc -and -not $frontendProc.HasExited) {
        Stop-Process -Id $frontendProc.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Host "[OK] Semua server berhasil dihentikan." -ForegroundColor Green
    Set-Location $ProjectDir
}

# Register Ctrl+C handler
[Console]::TreatControlCAsInput = $false

# Wait for servers
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  Video Stitch Studio Berhasil Dijalankan!              " -ForegroundColor Green
Write-Host "  - Web UI: http://localhost:5173                       " -ForegroundColor White
Write-Host "  - Backend API: http://localhost:8000                  " -ForegroundColor White
Write-Host ""
Write-Host "  Tekan [Ctrl + C] atau tutup jendela ini untuk keluar. " -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Green
Write-Host ""

# Open default browser
Start-Process "http://localhost:5173"

try {
    while ($true) {
        Start-Sleep -Seconds 1
        if ($backendProc.HasExited -or $frontendProc.HasExited) {
            Write-Host "⚠️ Salah satu server berhenti berjalan." -ForegroundColor Red
            break
        }
    }
} finally {
    Cleanup-Processes
}
