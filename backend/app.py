"""
FastAPI Backend Application for Video Stitch Studio.
Provides REST endpoints and WebSocket for hardware info, probing,
auto-naming, native file dialogs, and video compression/merging jobs.
"""

import os
import sys
import uuid
import asyncio
import platform
import subprocess
from typing import Dict, List, Any, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from engine.detector import detect_hardware
from engine.probe import probe_file, validate_merge_compatibility
from engine.naming import suggest_single_name, suggest_merge_name, suggest_batch_names
from engine.compressor import CompressionJob
from engine.merger import MergeJob

app = FastAPI(title="Video Stitch Studio API", version="0.1.0")

# Enable CORS for Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Connection manager for WebSockets
class WebSocketManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(connection)


ws_manager = WebSocketManager()

# Active jobs registry
active_jobs: Dict[str, Any] = {}
job_results: Dict[str, Any] = {}


async def job_progress_callback(data: Dict[str, Any]):
    """Broadcasts job progress updates via WebSocket and records them."""
    job_id = data.get("job_id")
    if job_id:
        job_results[job_id] = data
    await ws_manager.broadcast({"type": "job_progress", "data": data})


# Request Models
class ProbeRequest(BaseModel):
    paths: List[str]


class NamingSuggestRequest(BaseModel):
    mode: str  # 'single' or 'merge'
    paths: List[str]
    preset_label: Optional[str] = "2K_Master"


class CompressStartRequest(BaseModel):
    input_path: str
    output_path: str
    preset: Optional[str] = "best_2k"
    custom_opts: Optional[Dict[str, Any]] = None


class BatchCompressStartRequest(BaseModel):
    items: List[CompressStartRequest]


class MergeStartRequest(BaseModel):
    file_paths: List[str]
    output_path: str
    mode: Optional[str] = "auto"  # 'auto', 'instant_copy', 'reencode'


class CancelJobRequest(BaseModel):
    job_id: str


class RevealRequest(BaseModel):
    path: str


class DroppedFileInfo(BaseModel):
    name: str
    size: Optional[int] = None
    last_modified: Optional[int] = None


class LocateFilesRequest(BaseModel):
    files: List[DroppedFileInfo]


class BrowseRequest(BaseModel):
    type: str = "file"  # "file", "multiple_files", "directory"
    prompt: Optional[str] = "Select Video File"


def locate_file_on_system(filename: str, size: Optional[int] = None) -> Optional[str]:
    """Resolves local absolute path for dropped files using fast local index/mdfind."""
    if os.path.isabs(filename) and os.path.exists(filename):
        return filename

    sys_os = platform.system()
    home = os.path.expanduser("~")
    common_dirs = [
        os.path.join(home, "Downloads"),
        os.path.join(home, "Movies"),
        os.path.join(home, "Videos"),
        os.path.join(home, "Desktop"),
        os.path.join(home, "Documents"),
        os.getcwd(),
    ]

    # Quick direct check in common directories
    for d in common_dirs:
        candidate = os.path.join(d, filename)
        if os.path.exists(candidate):
            if size is None or abs(os.path.getsize(candidate) - size) < 2048:
                return candidate

    # On macOS, use mdfind (Spotlight) - ultra fast (~10ms)
    if sys_os == "Darwin":
        try:
            res = subprocess.run(
                ["mdfind", "-name", filename],
                stdout=subprocess.PIPE,
                text=True,
                timeout=3,
                check=False
            )
            candidates = [l.strip() for l in res.stdout.splitlines() if l.strip() and os.path.exists(l.strip())]
            if candidates:
                if size:
                    size_matched = [p for p in candidates if abs(os.path.getsize(p) - size) < 2048]
                    if size_matched:
                        size_matched.sort(key=lambda p: os.path.getmtime(p), reverse=True)
                        return size_matched[0]
                candidates.sort(key=lambda p: os.path.getmtime(p), reverse=True)
                return candidates[0]
        except Exception:
            pass

    return None


# --- REST Endpoints ---

@app.post("/api/locate-file")
async def locate_files(req: LocateFilesRequest):
    """
    Finds exact absolute filesystem path for files dropped from OS Finder/Explorer.
    """
    results = []
    for f in req.files:
        path = locate_file_on_system(f.name, f.size)
        if path:
            results.append({"name": f.name, "found": True, "path": path})
        else:
            results.append({"name": f.name, "found": False, "path": None})
    return {"results": results}


@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "service": "Video Stitch Studio Backend",
        "version": "0.1.0"
    }


@app.get("/api/hardware")
async def get_hardware():
    return detect_hardware()


@app.post("/api/probe")
async def probe_media(req: ProbeRequest):
    results = [probe_file(p) for p in req.paths]
    validation = validate_merge_compatibility(results) if len(results) > 0 else None
    return {
        "files": results,
        "merge_validation": validation
    }


@app.post("/api/suggest-naming")
async def suggest_naming(req: NamingSuggestRequest):
    if req.mode == "single":
        if not req.paths:
            raise HTTPException(status_code=400, detail="No path provided.")
        suggested = suggest_single_name(req.paths[0], req.preset_label or "2K_Master")
        return {"suggested_filename": suggested}
    elif req.mode == "batch":
        suggested_list = suggest_batch_names(req.paths, req.preset_label or "2K_Master")
        return {"suggested_filenames": suggested_list, "suggested_filename": suggested_list[0] if suggested_list else ""}
    else:
        suggested = suggest_merge_name(req.paths)
        return {"suggested_filename": suggested}


@app.post("/api/browse")
async def browse_dialog(req: BrowseRequest):
    """
    Opens native OS file picker or directory picker dialog.
    Returns list of chosen paths or directory path.
    """
    sys_os = platform.system()
    chosen_paths = []

    if sys_os == "Darwin":
        # macOS osascript
        if req.type == "directory":
            osa = f'''
            try
                set sel to choose folder with prompt "{req.prompt or 'Pilih Folder Tujuan'}"
                return POSIX path of sel
            on error
                return ""
            end try
            '''
        elif req.type == "multiple_files":
            osa = f'''
            try
                set sel to choose file with prompt "{req.prompt or 'Pilih File Video'}" of type {{"mp4", "mov", "m4v", "mkv", "avi"}} with multiple selections allowed
                set res to ""
                repeat with f in sel
                    set res to res & POSIX path of f & linefeed
                end repeat
                return res
            on error
                return ""
            end try
            '''
        else:
            osa = f'''
            try
                set sel to choose file with prompt "{req.prompt or 'Pilih File Video'}" of type {{"mp4", "mov", "m4v", "mkv", "avi"}}
                return POSIX path of sel
            on error
                return ""
            end try
            '''
        try:
            res = subprocess.run(["osascript", "-e", osa], stdout=subprocess.PIPE, text=True, check=False)
            output = res.stdout.strip()
            if output:
                lines = [l.strip() for l in output.splitlines() if l.strip()]
                chosen_paths = lines
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to open file picker: {str(e)}")

    elif sys_os == "Windows":
        # PowerShell dialog
        if req.type == "directory":
            ps_script = """
            Add-Type -AssemblyName System.Windows.Forms
            $f = New-Object System.Windows.Forms.FolderBrowserDialog
            $f.Description = 'Select Folder'
            if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
                Write-Output $f.SelectedPath
            }
            """
        elif req.type == "multiple_files":
            ps_script = """
            Add-Type -AssemblyName System.Windows.Forms
            $f = New-Object System.Windows.Forms.OpenFileDialog
            $f.Filter = 'Video Files (*.mp4;*.mov;*.mkv;*.m4v)|*.mp4;*.mov;*.mkv;*.m4v|All files (*.*)|*.*'
            $f.Multiselect = $true
            if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
                $f.FileNames | ForEach-Object { Write-Output $_ }
            }
            """
        else:
            ps_script = """
            Add-Type -AssemblyName System.Windows.Forms
            $f = New-Object System.Windows.Forms.OpenFileDialog
            $f.Filter = 'Video Files (*.mp4;*.mov;*.mkv;*.m4v)|*.mp4;*.mov;*.mkv;*.m4v|All files (*.*)|*.*'
            $f.Multiselect = $false
            if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
                Write-Output $f.FileName
            }
            """
        try:
            res = subprocess.run(["powershell", "-NoProfile", "-Command", ps_script], stdout=subprocess.PIPE, text=True, check=False)
            output = res.stdout.strip()
            if output:
                lines = [l.strip() for l in output.splitlines() if l.strip()]
                chosen_paths = lines
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to open Windows file picker: {str(e)}")

    return {"paths": chosen_paths}


@app.post("/api/compress/start")
async def start_compression(req: CompressStartRequest):
    if os.path.abspath(req.input_path) == os.path.abspath(req.output_path):
        raise HTTPException(
            status_code=400,
            detail="File output tidak boleh sama dengan file input asli. Sistem selalu membuat file baru untuk menjaga keamanan video mentah Anda."
        )

    job_id = f"comp_{uuid.uuid4().hex[:8]}"
    job = CompressionJob(
        job_id=job_id,
        input_path=req.input_path,
        output_path=req.output_path,
        preset=req.preset or "best_2k",
        custom_opts=req.custom_opts,
        progress_callback=job_progress_callback
    )
    active_jobs[job_id] = job
    job_results[job_id] = {"job_id": job_id, "status": "queued", "percentage": 0.0}

    # Run in background asyncio task
    asyncio.create_task(job.run())
    return {"job_id": job_id, "status": "started", "output_path": req.output_path}


@app.post("/api/merge/start")
async def start_merge(req: MergeStartRequest):
    out_abs = os.path.abspath(req.output_path)
    for p in req.file_paths:
        if os.path.abspath(p) == out_abs:
            raise HTTPException(
                status_code=400,
                detail="File output gabungan tidak boleh sama dengan salah satu file part video asli."
            )

    job_id = f"merge_{uuid.uuid4().hex[:8]}"
    job = MergeJob(
        job_id=job_id,
        file_paths=req.file_paths,
        output_path=req.output_path,
        mode=req.mode or "auto",
        progress_callback=job_progress_callback
    )
    active_jobs[job_id] = job
    job_results[job_id] = {"job_id": job_id, "status": "queued", "percentage": 0.0}

    asyncio.create_task(job.run())
    return {"job_id": job_id, "status": "started", "output_path": req.output_path}


@app.post("/api/job/cancel")
async def cancel_job(req: CancelJobRequest):
    job = active_jobs.pop(req.job_id, None)
    if job:
        job.cancel()

    # Record and broadcast cancelled state so UI immediately responds
    job_results[req.job_id] = {"job_id": req.job_id, "status": "cancelled", "percentage": 0.0}
    await ws_manager.broadcast({
        "type": "job_progress",
        "data": {"job_id": req.job_id, "status": "cancelled", "percentage": 0.0}
    })
    return {"job_id": req.job_id, "status": "cancelled"}


@app.get("/api/job/{job_id}/status")
async def get_job_status(job_id: str):
    if job_id in job_results:
        return job_results[job_id]
    raise HTTPException(status_code=404, detail="Job ID not found.")


@app.post("/api/reveal")
async def reveal_file(req: RevealRequest):
    """Reveals the given file in Finder (macOS) or File Explorer (Windows)."""
    target = os.path.abspath(req.path)
    if not os.path.exists(target):
        # If output file doesn't exist yet, try revealing parent directory
        parent = os.path.dirname(target)
        if os.path.exists(parent):
            target = parent
        else:
            raise HTTPException(status_code=404, detail="File or folder does not exist.")

    sys_os = platform.system()
    try:
        if sys_os == "Darwin":
            if os.path.isfile(target):
                subprocess.run(["open", "-R", target], check=False)
            else:
                subprocess.run(["open", target], check=False)
        elif sys_os == "Windows":
            if os.path.isfile(target):
                subprocess.run(["explorer", f"/select,{target}"], check=False)
            else:
                subprocess.run(["explorer", target], check=False)
        else:
            subprocess.run(["xdg-open", os.path.dirname(target)], check=False)
        return {"success": True, "revealed": target}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reveal file: {str(e)}")


# --- WebSocket Endpoint ---

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep alive and receive any ping/messages from frontend
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
