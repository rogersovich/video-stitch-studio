"""
Hardware and Encoder Auto-Detector
Identifies OS, CPU, GPU, and checks ffmpeg hardware encoders (Apple Silicon VideoToolbox, NVIDIA NVENC, CPU fallback).
"""

import os
import platform
import subprocess
import shutil
import functools
from typing import Dict, List, Any


@functools.lru_cache(maxsize=1)
def get_available_ffmpeg_encoders() -> List[str]:
    """Inspects FFmpeg binary to list all available video encoders."""
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        return []
    try:
        proc = subprocess.run(
            [ffmpeg_bin, "-encoders"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=5,
            check=False
        )
        encoders = []
        for line in proc.stdout.splitlines():
            line = line.strip()
            # FFmpeg encoder lines start with " V..... <encoder_name> ..."
            if line.startswith("V") and len(line.split()) >= 2:
                parts = line.split()
                encoder_name = parts[1]
                if encoder_name != "=" and not encoder_name.startswith("-"):
                    encoders.append(encoder_name)
        return encoders
    except Exception:
        return []


def detect_macos_gpu() -> str:
    """Attempts to identify the Apple Silicon chip name (e.g. Apple M2)."""
    try:
        proc = subprocess.run(
            ["sysctl", "-n", "machdep.cpu.brand_string"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=3,
            check=False
        )
        brand = proc.stdout.strip()
        if brand:
            return brand
    except Exception:
        pass
    
    try:
        # Fallback to system_profiler
        proc = subprocess.run(
            ["system_profiler", "SPHardwareDataType"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=4,
            check=False
        )
        for line in proc.stdout.splitlines():
            if "Chip:" in line:
                return line.split("Chip:")[1].strip()
    except Exception:
        pass
    
    return "Apple Silicon"


def detect_windows_gpu() -> str:
    """Attempts to identify NVIDIA or other dedicated GPUs on Windows."""
    # Try nvidia-smi first
    if shutil.which("nvidia-smi"):
        try:
            proc = subprocess.run(
                ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=3,
                check=False
            )
            name = proc.stdout.strip().splitlines()
            if name:
                return name[0].strip()
        except Exception:
            pass

    # Try powershell Get-CimInstance
    if shutil.which("powershell"):
        try:
            proc = subprocess.run(
                ["powershell", "-NoProfile", "-Command", "(Get-CimInstance Win32_VideoController).Name"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=4,
                check=False
            )
            names = [l.strip() for l in proc.stdout.splitlines() if l.strip()]
            for n in names:
                if "nvidia" in n.lower() or "rtx" in n.lower() or "gtx" in n.lower():
                    return n
            if names:
                return names[0]
        except Exception:
            pass

    return "Dedicated/Integrated GPU"


def detect_hardware() -> Dict[str, Any]:
    """
    Main hardware detector.
    Returns detected platform, hardware device name, available encoders,
    recommended codec and preset parameters.
    """
    system_os = platform.system()  # 'Darwin', 'Windows', 'Linux'
    available_encoders = get_available_ffmpeg_encoders()

    os_label = "macOS" if system_os == "Darwin" else system_os
    device_name = "Unknown CPU"
    chip_type = "cpu"
    recommended_codec = "libx264"
    badge_text = "Detected: CPU (Software Fallback)"
    has_hw = False
    details: Dict[str, Any] = {}

    if system_os == "Darwin":
        device_name = detect_macos_gpu()
        is_arm = platform.machine() in ["arm64", "aarch64"]
        
        # Check for VideoToolbox
        has_vt_hevc = "hevc_videotoolbox" in available_encoders
        has_vt_h264 = "h264_videotoolbox" in available_encoders
        
        if has_vt_hevc or has_vt_h264:
            has_hw = True
            chip_type = "apple_silicon" if is_arm else "apple_intel"
            # Recommend HEVC if available, else H264
            recommended_codec = "hevc_videotoolbox" if has_vt_hevc else "h264_videotoolbox"
            badge_text = f"Detected: {device_name} (VideoToolbox)"
            details = {
                "hardware_encoder": recommended_codec,
                "audio_bitrate": "192k",
                "default_quality_param": 65,  # scale 0-100 for videotoolbox -q:v
                "pixel_format": "yuv420p",
            }
        else:
            badge_text = f"Detected: {device_name} (CPU Fallback)"

    elif system_os == "Windows":
        device_name = detect_windows_gpu()
        has_nvenc_hevc = "hevc_nvenc" in available_encoders
        has_nvenc_h264 = "h264_nvenc" in available_encoders
        
        if has_nvenc_hevc or has_nvenc_h264:
            has_hw = True
            chip_type = "nvidia"
            recommended_codec = "hevc_nvenc" if has_nvenc_hevc else "h264_nvenc"
            badge_text = f"Detected: {device_name} (NVENC)"
            details = {
                "hardware_encoder": recommended_codec,
                "preset": "p6",
                "cq": 20,
                "audio_bitrate": "192k",
                "pixel_format": "yuv420p",
            }
        else:
            badge_text = f"Detected: {device_name} (CPU Fallback)"

    else:
        # Linux or other OS
        if "hevc_nvenc" in available_encoders or "h264_nvenc" in available_encoders:
            has_hw = True
            chip_type = "nvidia"
            recommended_codec = "hevc_nvenc" if "hevc_nvenc" in available_encoders else "h264_nvenc"
            badge_text = "Detected: NVIDIA (NVENC)"
        else:
            device_name = platform.processor() or "Generic CPU"
            badge_text = f"Detected: {device_name} (CPU Fallback)"

    # Fallback params if no hardware acceleration
    if not has_hw:
        if "libx265" in available_encoders:
            recommended_codec = "libx265"
        else:
            recommended_codec = "libx264"
        details = {
            "hardware_encoder": recommended_codec,
            "crf": 22,
            "preset": "medium",
            "audio_bitrate": "192k",
            "pixel_format": "yuv420p",
        }

    return {
        "os": os_label,
        "device_name": device_name,
        "chip_type": chip_type,
        "has_hardware_acceleration": has_hw,
        "recommended_codec": recommended_codec,
        "badge_text": badge_text,
        "available_encoders": available_encoders,
        "supported_codecs": [
            e for e in ["hevc_videotoolbox", "h264_videotoolbox", "hevc_nvenc", "h264_nvenc", "libx265", "libx264"]
            if e in available_encoders
        ],
        "default_details": details,
        "ffmpeg_installed": bool(shutil.which("ffmpeg")),
        "ffprobe_installed": bool(shutil.which("ffprobe")),
    }


if __name__ == "__main__":
    import json
    info = detect_hardware()
    print(json.dumps(info, indent=2))
