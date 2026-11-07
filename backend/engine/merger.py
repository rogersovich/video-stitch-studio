"""
Video Stitching & Merger Engine
Supports:
1. Mode A: Instant Lossless Concat (10-30s stream copy, 0% CPU/GPU overhead)
2. Mode B: Concat + Re-encode (standardized hardware re-encoding fallback for mismatched files)
"""

import os
import shutil
import tempfile
import asyncio
import time
from typing import Dict, List, Any, Optional, Callable, Awaitable
from .probe import probe_file, validate_merge_compatibility, format_duration, format_bytes
from .detector import detect_hardware


def create_concat_list_file(file_paths: List[str]) -> str:
    """
    Creates a temporary text file formatted for FFmpeg's concat demuxer.
    Each line is: file 'path/to/file' with single quotes escaped.
    """
    fd, temp_path = tempfile.mkstemp(prefix="vss_concat_", suffix=".txt")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        for path in file_paths:
            # Escape single quotes for ffmpeg concat demuxer: ' -> '\''
            abs_path = os.path.abspath(path)
            escaped = abs_path.replace("'", "'\\''")
            f.write(f"file '{escaped}'\n")
    return temp_path


class MergeJob:
    def __init__(
        self,
        job_id: str,
        file_paths: List[str],
        output_path: str,
        mode: str = "auto",  # 'auto', 'instant_copy', 'reencode'
        progress_callback: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None
    ):
        self.job_id = job_id
        self.file_paths = file_paths
        self.output_path = output_path
        self.mode = mode
        self.progress_callback = progress_callback
        self.process: Optional[asyncio.subprocess.Process] = None
        self.is_cancelled = False
        self.status = "queued"
        self.concat_file_path: Optional[str] = None
        self.total_duration_sec = 0.0
        self.start_time = 0.0

    async def run(self) -> Dict[str, Any]:
        self.status = "inspecting"

        if len(self.file_paths) < 1:
            err = "Minimal 1 video dibutuhkan untuk penggabungan."
            self.status = "failed"
            if self.progress_callback:
                await self.progress_callback({"job_id": self.job_id, "status": "failed", "error": err})
            return {"success": False, "error": err}

        # 1. Probe all files
        probed_files = [probe_file(p) for p in self.file_paths]
        validation = validate_merge_compatibility(probed_files)

        self.total_duration_sec = validation.get("total_duration_sec", 0.0)
        can_instant = validation.get("can_instant_copy", False)

        # Decide mode
        selected_mode = self.mode
        if selected_mode == "auto":
            selected_mode = "instant_copy" if can_instant else "reencode"

        self.concat_file_path = create_concat_list_file(self.file_paths)
        ffmpeg_bin = shutil.which("ffmpeg") or "ffmpeg"
        os.makedirs(os.path.dirname(os.path.abspath(self.output_path)), exist_ok=True)

        if selected_mode == "instant_copy":
            # Mode A: Instant Concat Stream Copy
            cmd = [
                ffmpeg_bin,
                "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", self.concat_file_path,
                "-c", "copy",
                "-movflags", "+faststart",
                "-progress", "pipe:1",
                "-nostats",
                self.output_path
            ]
        else:
            # Mode B: Re-encode Concat Fallback
            hw_info = detect_hardware()
            chip_type = hw_info.get("chip_type", "cpu")
            available_encoders = hw_info.get("available_encoders", [])

            # Hardware encoder
            if chip_type in ["apple_silicon", "apple_intel"] and "hevc_videotoolbox" in available_encoders:
                encoder_flags = ["-c:v", "hevc_videotoolbox", "-q:v", "65", "-tag:v", "hvc1"]
            elif chip_type in ["apple_silicon", "apple_intel"] and "h264_videotoolbox" in available_encoders:
                encoder_flags = ["-c:v", "h264_videotoolbox", "-q:v", "65"]
            elif chip_type == "nvidia" and "hevc_nvenc" in available_encoders:
                encoder_flags = ["-c:v", "hevc_nvenc", "-preset", "p6", "-cq", "20", "-rc", "vbr", "-tag:v", "hvc1"]
            elif chip_type == "nvidia" and "h264_nvenc" in available_encoders:
                encoder_flags = ["-c:v", "h264_nvenc", "-preset", "p6", "-cq", "20", "-rc", "vbr"]
            elif "libx265" in available_encoders:
                encoder_flags = ["-c:v", "libx265", "-crf", "22", "-preset", "medium", "-tag:v", "hvc1"]
            else:
                encoder_flags = ["-c:v", "libx264", "-crf", "22", "-preset", "medium"]

            # Determine target resolution: avoid unwanted upscaling if all parts are 1080p or smaller
            max_w = max((f.get("width", 0) for f in probed_files), default=2560)
            max_h = max((f.get("height", 0) for f in probed_files), default=1440)
            if max_w <= 1920 and max_h <= 1080:
                target_w, target_h = 1920, 1080
            else:
                target_w, target_h = 2560, 1440

            vf_filter = f"scale={target_w}:{target_h}:force_original_aspect_ratio=decrease,pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2,fps=30"

            # Check if all audio codecs match AAC with same sample rate -> stream copy audio for maximum speed!
            all_aac = all(f.get("audio_codec") == "aac" and f.get("audio_sample_rate") == probed_files[0].get("audio_sample_rate") for f in probed_files)
            audio_flags = ["-c:a", "copy"] if all_aac else ["-c:a", "aac", "-b:a", "192k", "-ar", "48000"]

            cmd = [
                ffmpeg_bin,
                "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", self.concat_file_path,
                "-vf", vf_filter,
                *encoder_flags,
                "-pix_fmt", "yuv420p",
                *audio_flags,
                "-movflags", "+faststart",
                "-progress", "pipe:1",
                "-nostats",
                self.output_path
            ]

        self.status = "running"
        self.start_time = time.time()

        try:
            self.process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            current_sec = 0.0
            fps_val = 0.0
            speed_val = "1.0x"
            speed_mult = 1.0

            while self.process.returncode is None:
                line = await self.process.stdout.readline()
                if not line:
                    break
                line_str = line.decode("utf-8", errors="replace").strip()
                if "=" in line_str:
                    key, val = line_str.split("=", 1)
                    key = key.strip()
                    val = val.strip()

                    if key == "out_time":
                        try:
                            # FFmpeg outputs out_time=HH:MM:SS.microsecond
                            parts = val.split(":")
                            if len(parts) == 3:
                                current_sec = float(parts[0]) * 3600 + float(parts[1]) * 60 + float(parts[2])
                        except Exception:
                            pass
                    elif key in ["out_time_us", "out_time_ms"]:
                        try:
                            # In FFmpeg, out_time_ms is also formatted in microseconds
                            current_sec = float(val) / 1_000_000.0
                        except Exception:
                            pass
                    elif key == "fps":
                        try:
                            fps_val = float(val)
                        except Exception:
                            pass
                    elif key == "speed":
                        speed_val = val
                        try:
                            speed_mult = float(val.replace("x", ""))
                        except Exception:
                            pass

                    elif key == "progress" and (val == "continue" or val == "end"):
                        percentage = 0.0
                        if self.total_duration_sec > 0:
                            current_sec = min(current_sec, self.total_duration_sec)
                            percentage = min(99.9, round((current_sec / self.total_duration_sec) * 100.0, 1))

                        elapsed = time.time() - self.start_time
                        eta_sec = 0.0
                        if speed_mult > 0.05 and self.total_duration_sec > current_sec:
                            eta_sec = round((self.total_duration_sec - current_sec) / speed_mult, 1)

                        if self.progress_callback:
                            await self.progress_callback({
                                "job_id": self.job_id,
                                "status": "running",
                                "mode": selected_mode,
                                "percentage": percentage,
                                "current_time_sec": current_sec,
                                "current_time_formatted": format_duration(current_sec),
                                "total_duration_sec": self.total_duration_sec,
                                "total_duration_formatted": format_duration(self.total_duration_sec),
                                "fps": fps_val,
                                "speed": speed_val,
                                "elapsed_sec": round(elapsed, 1),
                                "eta_sec": eta_sec,
                                "eta_formatted": format_duration(eta_sec)
                            })

            stdout, stderr = await self.process.communicate()

            # Clean up temporary concat list
            if self.concat_file_path and os.path.exists(self.concat_file_path):
                try:
                    os.remove(self.concat_file_path)
                except Exception:
                    pass

            if self.is_cancelled:
                self.status = "cancelled"
                if os.path.exists(self.output_path):
                    try:
                        os.remove(self.output_path)
                    except Exception:
                        pass
                if self.progress_callback:
                    await self.progress_callback({
                        "job_id": self.job_id,
                        "status": "cancelled",
                        "percentage": 0.0
                    })
                return {"success": False, "error": "Merge was cancelled."}

            if self.process.returncode != 0:
                self.status = "failed"
                err_msg = stderr.decode("utf-8", errors="replace").strip()
                if self.progress_callback:
                    await self.progress_callback({
                        "job_id": self.job_id,
                        "status": "failed",
                        "error": err_msg or "FFmpeg exited with error during merge."
                    })
                return {"success": False, "error": err_msg}

            self.status = "completed"
            out_probe = probe_file(self.output_path)
            res_payload = {
                "job_id": self.job_id,
                "status": "completed",
                "mode": selected_mode,
                "percentage": 100.0,
                "output_path": self.output_path,
                "output_size_formatted": out_probe.get("size_formatted", ""),
                "output_size_bytes": out_probe.get("size_bytes", 0),
                "elapsed_sec": round(time.time() - self.start_time, 1),
            }
            if self.progress_callback:
                await self.progress_callback(res_payload)
            return {"success": True, "output_path": self.output_path, "probe": out_probe, "mode": selected_mode}

        except Exception as e:
            err_desc = f"{type(e).__name__}: {e}" if str(e) else type(e).__name__
            self.status = "failed"
            if self.progress_callback:
                await self.progress_callback({"job_id": self.job_id, "status": "failed", "error": err_desc})
            return {"success": False, "error": err_desc}

    def cancel(self):
        self.is_cancelled = True
        if self.process and self.process.returncode is None:
            try:
                self.process.terminate()
            except Exception:
                pass
        if self.concat_file_path and os.path.exists(self.concat_file_path):
            try:
                os.remove(self.concat_file_path)
            except Exception:
                pass
