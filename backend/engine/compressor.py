"""
FFmpeg compression engine with hardware acceleration and live progress tracking.
Supports Apple Silicon VideoToolbox (M1/M2/M3), NVIDIA NVENC, and CPU fallback.
"""

import os
import shutil
import asyncio
import subprocess
import time
from typing import Dict, Any, Callable, Optional, Awaitable
from .detector import detect_hardware
from .probe import probe_file, format_duration


# Target resolution per preset; "best_2k" / "max_compression" fall back to the 2K default.
PRESET_RESOLUTIONS = {
    "best_1080p": "1920x1080",
}
DEFAULT_RESOLUTION = "2560x1440"


def should_skip_scale(target_res: str, source_width: int, source_height: int) -> bool:
    """
    Anti-upscale guard: True when the source already fits inside the target
    resolution, so the video keeps its own resolution (same quality settings).
    """
    if not source_width or not source_height:
        return False
    try:
        tw, th = (int(v) for v in target_res.split("x"))
    except Exception:
        return False
    return source_width <= tw and source_height <= th


def build_ffmpeg_compression_cmd(
    input_path: str,
    output_path: str,
    preset: str = "best_2k",
    custom_opts: Optional[Dict[str, Any]] = None,
    source_width: int = 0,
    source_height: int = 0
) -> list[str]:
    """
    Constructs the ffmpeg command arguments for compression based on detected hardware.
    Never upscales: if the source is smaller than the target resolution, it is kept as-is.
    """
    custom_opts = custom_opts or {}
    hw_info = detect_hardware()
    chip_type = hw_info.get("chip_type", "cpu")
    available_encoders = hw_info.get("available_encoders", [])

    # Target settings
    target_fps = custom_opts.get("fps", 30)
    target_res = custom_opts.get("resolution") or PRESET_RESOLUTIONS.get(preset, DEFAULT_RESOLUTION)
    custom_codec = custom_opts.get("codec")
    custom_quality = custom_opts.get("quality")  # For M2: 0-100; For NVENC: CQ (e.g. 20); For CPU: CRF (e.g. 22)

    ffmpeg_bin = shutil.which("ffmpeg") or "ffmpeg"
    cmd = [ffmpeg_bin, "-y", "-i", input_path]

    # Video filters for resolution & constant framerate
    vf_filters = []
    if target_res and target_res != "original" and not should_skip_scale(target_res, source_width, source_height):
        try:
            w, h = target_res.split("x")
            vf_filters.append(f"scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2")
        except Exception:
            pass
    
    if target_fps and target_fps > 0:
        vf_filters.append(f"fps={target_fps}")

    if vf_filters:
        cmd.extend(["-vf", ",".join(vf_filters)])

    # Select encoder and compression parameters
    # Codec priority
    if custom_codec and custom_codec in available_encoders:
        encoder = custom_codec
    elif chip_type in ["apple_silicon", "apple_intel"] and "hevc_videotoolbox" in available_encoders:
        encoder = "hevc_videotoolbox"
    elif chip_type in ["apple_silicon", "apple_intel"] and "h264_videotoolbox" in available_encoders:
        encoder = "h264_videotoolbox"
    elif chip_type == "nvidia" and "hevc_nvenc" in available_encoders:
        encoder = "hevc_nvenc"
    elif chip_type == "nvidia" and "h264_nvenc" in available_encoders:
        encoder = "h264_nvenc"
    elif "libx265" in available_encoders:
        encoder = "libx265"
    else:
        encoder = "libx264"

    cmd.extend(["-c:v", encoder])

    # Hardware specific quality configuration
    if "videotoolbox" in encoder:
        # Apple Silicon VideoToolbox
        # Quality scale is 1-100 (where ~65 is visually lossless high quality)
        if preset == "max_compression":
            q_val = custom_quality if custom_quality is not None else 50
        elif preset == "custom" and custom_quality is not None:
            q_val = int(custom_quality)
        else: # best_2k / best_1080p default
            q_val = 65

        cmd.extend(["-q:v", str(q_val)])
        if "hevc" in encoder:
            cmd.extend(["-tag:v", "hvc1"])
        cmd.extend(["-pix_fmt", "yuv420p"])

    elif "nvenc" in encoder:
        # NVIDIA NVENC
        if preset == "max_compression":
            preset_nv = "p5"
            cq_val = custom_quality if custom_quality is not None else 26
        elif preset == "custom":
            preset_nv = custom_opts.get("nvenc_preset", "p6")
            cq_val = custom_quality if custom_quality is not None else 20
        else: # best_2k / best_1080p default
            preset_nv = "p6"
            cq_val = 20

        cmd.extend(["-preset", preset_nv, "-rc", "vbr", "-cq", str(cq_val)])
        if "hevc" in encoder:
            cmd.extend(["-tag:v", "hvc1"])
        cmd.extend(["-pix_fmt", "yuv420p"])

    else:
        # CPU Fallback (libx264 / libx265)
        if preset == "max_compression":
            cpu_preset = "fast"
            crf_val = custom_quality if custom_quality is not None else 26
        elif preset == "custom":
            cpu_preset = custom_opts.get("cpu_preset", "medium")
            crf_val = custom_quality if custom_quality is not None else 22
        else: # best_2k / best_1080p default
            cpu_preset = "medium"
            crf_val = 22

        cmd.extend(["-crf", str(crf_val), "-preset", cpu_preset])
        if "libx265" in encoder:
            cmd.extend(["-tag:v", "hvc1"])
        cmd.extend(["-pix_fmt", "yuv420p"])

    # Standardized Audio settings: AAC 192k
    cmd.extend(["-c:a", "aac", "-b:a", "192k", "-ar", "48000"])

    # Fast start for streaming/quick playback and progress reporting
    cmd.extend(["-movflags", "+faststart", "-progress", "pipe:1", "-nostats"])
    cmd.append(output_path)

    return cmd


class CompressionJob:
    def __init__(
        self,
        job_id: str,
        input_path: str,
        output_path: str,
        preset: str = "best_2k",
        custom_opts: Optional[Dict[str, Any]] = None,
        progress_callback: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None
    ):
        self.job_id = job_id
        self.input_path = input_path
        self.output_path = output_path
        self.preset = preset
        self.custom_opts = custom_opts or {}
        self.progress_callback = progress_callback
        self.process: Optional[asyncio.subprocess.Process] = None
        self.is_cancelled = False
        self.status = "queued"
        self.total_duration_sec = 0.0
        self.start_time = 0.0

    async def run(self) -> Dict[str, Any]:
        self.status = "inspecting"
        # 1. Probe input file to obtain duration
        probe_res = probe_file(self.input_path)
        if not probe_res.get("is_valid"):
            self.status = "failed"
            err = probe_res.get("error", "Invalid video file.")
            if self.progress_callback:
                await self.progress_callback({
                    "job_id": self.job_id,
                    "status": "failed",
                    "error": err
                })
            return {"success": False, "error": err}

        self.total_duration_sec = probe_res.get("duration_sec", 0.0)

        # 2. Build ffmpeg command
        cmd = build_ffmpeg_compression_cmd(
            self.input_path,
            self.output_path,
            self.preset,
            self.custom_opts,
            source_width=probe_res.get("width", 0),
            source_height=probe_res.get("height", 0)
        )

        os.makedirs(os.path.dirname(os.path.abspath(self.output_path)), exist_ok=True)

        self.status = "running"
        self.start_time = time.time()

        try:
            self.process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            # Monitor progress
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
                return {"success": False, "error": "Job was cancelled."}

            if self.process.returncode != 0:
                self.status = "failed"
                err_msg = stderr.decode("utf-8", errors="replace").strip()
                if self.progress_callback:
                    await self.progress_callback({
                        "job_id": self.job_id,
                        "status": "failed",
                        "error": err_msg or "FFmpeg exited with error."
                    })
                return {"success": False, "error": err_msg}

            # Success
            self.status = "completed"
            out_probe = probe_file(self.output_path)
            res_payload = {
                "job_id": self.job_id,
                "status": "completed",
                "percentage": 100.0,
                "output_path": self.output_path,
                "output_size_formatted": out_probe.get("size_formatted", ""),
                "output_size_bytes": out_probe.get("size_bytes", 0),
                "elapsed_sec": round(time.time() - self.start_time, 1),
                "fps": fps_val
            }
            if self.progress_callback:
                await self.progress_callback(res_payload)
            return {"success": True, "output_path": self.output_path, "probe": out_probe}

        except Exception as e:
            self.status = "failed"
            if self.progress_callback:
                await self.progress_callback({
                    "job_id": self.job_id,
                    "status": "failed",
                    "error": str(e)
                })
            return {"success": False, "error": str(e)}

    def cancel(self):
        self.is_cancelled = True
        if self.process and self.process.returncode is None:
            try:
                self.process.terminate()
            except Exception:
                pass
