"""
FFprobe metadata inspector and compatibility validator.
Extracts video metadata, stream info, checks file integrity,
and validates concat/merge compatibility between multiple files.
"""

import os
import json
import shutil
import subprocess
from typing import Dict, List, Any, Optional


def format_duration(seconds: float) -> str:
    """Formats seconds into HH:MM:SS or MM:SS string."""
    if seconds <= 0:
        return "00:00"
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def format_bytes(num_bytes: int) -> str:
    """Formats bytes into human readable MB or GB string."""
    if num_bytes < 1024 * 1024:
        return f"{num_bytes / 1024:.1f} KB"
    if num_bytes < 1024 * 1024 * 1024:
        return f"{num_bytes / (1024 * 1024):.1f} MB"
    return f"{num_bytes / (1024 * 1024 * 1024):.2f} GB"


def parse_framerate(fps_str: str) -> float:
    """Parses fractional framerate string (e.g. '30/1' or '30000/1001') to float."""
    try:
        if "/" in fps_str:
            num, den = fps_str.split("/")
            den_f = float(den)
            return round(float(num) / den_f, 2) if den_f != 0 else 0.0
        return round(float(fps_str), 2)
    except Exception:
        return 0.0


def probe_file(file_path: str) -> Dict[str, Any]:
    """
    Inspects a single media file using ffprobe.
    Returns metadata dictionary including video resolution, fps, codec,
    bitrate, duration, audio streams, and integrity status.
    """
    if not os.path.exists(file_path):
        return {
            "file_path": file_path,
            "filename": os.path.basename(file_path),
            "is_valid": False,
            "error": "File does not exist."
        }

    ffprobe_bin = shutil.which("ffprobe")
    if not ffprobe_bin:
        return {
            "file_path": file_path,
            "filename": os.path.basename(file_path),
            "is_valid": False,
            "error": "ffprobe executable not found in PATH."
        }

    cmd = [
        ffprobe_bin,
        "-v", "error",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        file_path
    ]

    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=15)
        if proc.returncode != 0:
            return {
                "file_path": file_path,
                "filename": os.path.basename(file_path),
                "is_valid": False,
                "error": proc.stderr.strip() or "ffprobe failed to read file."
            }

        data = json.loads(proc.stdout)
    except subprocess.TimeoutExpired:
        return {
            "file_path": file_path,
            "filename": os.path.basename(file_path),
            "is_valid": False,
            "error": "ffprobe inspection timed out."
        }
    except Exception as e:
        return {
            "file_path": file_path,
            "filename": os.path.basename(file_path),
            "is_valid": False,
            "error": f"Error parsing media metadata: {str(e)}"
        }

    streams = data.get("streams", [])
    fmt = data.get("format", {})

    video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio_stream = next((s for s in streams if s.get("codec_type") == "audio"), None)

    if not video_stream:
        return {
            "file_path": file_path,
            "filename": os.path.basename(file_path),
            "is_valid": False,
            "error": "No valid video stream found in file."
        }

    # Video details
    width = int(video_stream.get("width") or 0)
    height = int(video_stream.get("height") or 0)
    video_codec = video_stream.get("codec_name", "unknown")
    video_codec_long = video_stream.get("codec_long_name", "")
    pix_fmt = video_stream.get("pix_fmt", "yuv420p")

    fps_raw = video_stream.get("r_frame_rate", "30/1")
    fps = parse_framerate(fps_raw)
    avg_fps = parse_framerate(video_stream.get("avg_frame_rate", fps_raw))
    effective_fps = avg_fps if avg_fps > 0 else fps

    # Duration & size
    duration_sec = 0.0
    if "duration" in video_stream:
        try:
            duration_sec = float(video_stream["duration"])
        except Exception:
            pass
    if duration_sec <= 0 and "duration" in fmt:
        try:
            duration_sec = float(fmt["duration"])
        except Exception:
            pass

    size_bytes = 0
    if "size" in fmt:
        try:
            size_bytes = int(fmt["size"])
        except Exception:
            pass
    if size_bytes <= 0:
        try:
            size_bytes = os.path.getsize(file_path)
        except Exception:
            pass

    # Bitrate
    bitrate_bps = 0
    if "bit_rate" in fmt:
        try:
            bitrate_bps = int(fmt["bit_rate"])
        except Exception:
            pass
    elif "bit_rate" in video_stream:
        try:
            bitrate_bps = int(video_stream["bit_rate"])
        except Exception:
            pass

    bitrate_str = f"{bitrate_bps / 1_000_000:.2f} Mbps" if bitrate_bps >= 1_000_000 else f"{bitrate_bps / 1000:.0f} kbps"

    # Audio details
    audio_codec = audio_stream.get("codec_name", "none") if audio_stream else "none"
    audio_channels = int(audio_stream.get("channels") or 0) if audio_stream else 0
    audio_sample_rate = int(audio_stream.get("sample_rate") or 0) if audio_stream else 0

    encoder_name = (
        video_stream.get("tags", {}).get("encoder") or
        fmt.get("tags", {}).get("encoder") or
        ""
    )
    extradata_size = int(video_stream.get("extradata_size") or 0)
    codec_tag_string = video_stream.get("codec_tag_string") or ""

    return {
        "file_path": file_path,
        "filename": os.path.basename(file_path),
        "is_valid": True,
        "width": width,
        "height": height,
        "resolution": f"{width}x{height}",
        "is_2k": (width >= 2560 and height >= 1440) or (height >= 1440),
        "video_codec": video_codec,
        "video_codec_long": video_codec_long,
        "pix_fmt": pix_fmt,
        "fps": effective_fps,
        "fps_raw": fps_raw,
        "duration_sec": duration_sec,
        "duration_formatted": format_duration(duration_sec),
        "size_bytes": size_bytes,
        "size_formatted": format_bytes(size_bytes),
        "bitrate_bps": bitrate_bps,
        "bitrate_formatted": bitrate_str,
        "has_audio": audio_stream is not None,
        "audio_codec": audio_codec,
        "audio_channels": audio_channels,
        "audio_sample_rate": audio_sample_rate,
        "encoder": encoder_name,
        "extradata_size": extradata_size,
        "codec_tag_string": codec_tag_string,
        "error": None
    }


def validate_merge_compatibility(files_meta: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Evaluates multiple video files for concatenation compatibility.
    Checks for:
    - Same resolution (width x height)
    - Compatible framerate (fps difference < 0.5)
    - Compatible video codec (e.g. h264 vs hevc)
    - Compatible audio stream existence and audio codec

    Returns status indicating if instant lossless copy is safe, or if fallback re-encode is recommended.
    """
    valid_files = [f for f in files_meta if f.get("is_valid")]

    if not valid_files:
        return {
            "can_instant_copy": False,
            "badge": "error",
            "badge_label": "Tidak Ada File Valid",
            "message": "Silakan pilih minimal 2 video yang valid.",
            "issues": ["Tidak ada video valid yang ditemukan."],
            "recommended_mode": "none"
        }

    if len(valid_files) == 1:
        return {
            "can_instant_copy": True,
            "badge": "ready",
            "badge_label": "Hanya 1 File",
            "message": "Tambahkan minimal 1 video lagi untuk melakukan penggabungan (merge).",
            "issues": [],
            "recommended_mode": "instant_copy"
        }

    first = valid_files[0]
    base_res = first["resolution"]
    base_fps = first["fps"]
    base_vcodec = first["video_codec"]
    base_acodec = first["audio_codec"]

    issues = []

    for idx, f in enumerate(valid_files[1:], start=2):
        name = f["filename"]
        # Check resolution
        if f["resolution"] != base_res:
            issues.append(
                f"Perbedaan Resolusi: File #{idx} ({name}) adalah {f['resolution']} sedangkan File #1 adalah {base_res}."
            )
        # Check FPS (tolerance 0.5)
        if abs(f["fps"] - base_fps) > 0.5:
            issues.append(
                f"Perbedaan FPS: File #{idx} ({name}) memiliki {f['fps']} FPS sedangkan File #1 memiliki {base_fps} FPS."
            )
        # Check video codec
        if f["video_codec"] != base_vcodec:
            issues.append(
                f"Perbedaan Codec Video: File #{idx} ({name}) menggunakan {f['video_codec']} sedangkan File #1 menggunakan {base_vcodec}."
            )
        # Check audio
        if f["audio_codec"] != base_acodec:
            issues.append(
                f"Perbedaan Audio: File #{idx} ({name}) audio adalah {f['audio_codec']} sedangkan File #1 adalah {base_acodec}."
            )

        # Check hardware encoder / bitstream parameter sets
        base_enc = first.get("encoder", "").lower()
        f_enc = f.get("encoder", "").lower()
        base_extra = first.get("extradata_size", 0)
        f_extra = f.get("extradata_size", 0)

        is_vt_1 = "videotoolbox" in base_enc
        is_vt_2 = "videotoolbox" in f_enc
        is_nv_1 = "nvenc" in base_enc
        is_nv_2 = "nvenc" in f_enc

        if (is_vt_1 != is_vt_2) or (is_nv_1 != is_nv_2):
            enc1_desc = "Apple VideoToolbox (Mac)" if is_vt_1 else ("NVIDIA NVENC" if is_nv_1 else (base_enc or "Lainnya"))
            enc2_desc = "Apple VideoToolbox (Mac)" if is_vt_2 else ("NVIDIA NVENC" if is_nv_2 else (f_enc or "Lainnya"))
            issues.append(
                f"Perbedaan Hardware Encoder: File #1 memakai {enc1_desc} sedangkan File #{idx} ({name}) memakai {enc2_desc}. Parameter bitstream berbeda, wajib gunakan Mode Re-encode agar video tidak freeze/glitch di titik transisi."
            )
        elif base_extra > 0 and f_extra > 0 and abs(base_extra - f_extra) > 4:
            issues.append(
                f"Perbedaan Parameter Bitstream: Header extradata File #{idx} ({f_extra}B) berbeda dari File #1 ({base_extra}B). Wajib gunakan Mode Re-encode agar video tidak glitch saat transisi."
            )

    can_instant_copy = len(issues) == 0

    if can_instant_copy:
        total_duration = sum(f.get("duration_sec", 0.0) for f in valid_files)
        total_size = sum(f.get("size_bytes", 0) for f in valid_files)
        return {
            "can_instant_copy": True,
            "badge": "ready",
            "badge_label": "Siap Instant Copy (Lossless)",
            "message": "Semua parameter video seragam (Resolusi, FPS, Codec). Penggabungan instan (~15 detik) siap dijalankan tanpa re-encoding!",
            "issues": [],
            "recommended_mode": "instant_copy",
            "total_duration_sec": total_duration,
            "total_duration_formatted": format_duration(total_duration),
            "total_size_bytes": total_size,
            "total_size_formatted": format_bytes(total_size)
        }
    else:
        total_duration = sum(f.get("duration_sec", 0.0) for f in valid_files)
        total_size = sum(f.get("size_bytes", 0) for f in valid_files)
        return {
            "can_instant_copy": False,
            "badge": "warning",
            "badge_label": "Perlu Re-encode (Beda Parameter / Encoder)",
            "message": "Sistem mendeteksi perbedaan parameter video atau encoder hardware antar part. Gunakan Mode Re-encode Terstandarisasi agar video tersambung mulus 100% tanpa glitch atau freeze!",
            "issues": issues,
            "recommended_mode": "reencode",
            "total_duration_sec": total_duration,
            "total_duration_formatted": format_duration(total_duration),
            "total_size_bytes": total_size,
            "total_size_formatted": format_bytes(total_size)
        }
