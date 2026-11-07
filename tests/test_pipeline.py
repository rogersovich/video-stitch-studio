"""
Integration test for Video Stitch Studio engines.
Tests probe, auto-naming, compression with hardware acceleration,
and instant lossless concat.
"""

import os
import sys
import shutil
import subprocess
import asyncio

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from engine.detector import detect_hardware
from engine.probe import probe_file, validate_merge_compatibility
from engine.naming import suggest_single_name, suggest_merge_name
from engine.compressor import CompressionJob
from engine.merger import MergeJob


async def run_tests():
    test_dir = os.path.abspath("temp_test_videos")
    os.makedirs(test_dir, exist_ok=True)

    v1 = os.path.join(test_dir, "CapCut_Ch01-06_Export.mp4")
    v2 = os.path.join(test_dir, "Ch07-12.mp4")

    # Generate quick 2s sample videos
    subprocess.run([
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", "testsrc=duration=2:size=2560x1440:rate=30",
        "-f", "lavfi", "-i", "sine=frequency=1000:duration=2",
        "-c:v", "libx264", "-c:a", "aac", "-b:a", "192k",
        v1
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

    subprocess.run([
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", "testsrc=duration=2:size=2560x1440:rate=30",
        "-f", "lavfi", "-i", "sine=frequency=1200:duration=2",
        "-c:v", "libx264", "-c:a", "aac", "-b:a", "192k",
        v2
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)

    print("=== TEST 1: Hardware Detection ===")
    hw = detect_hardware()
    print(f"OS: {hw['os']}, Device: {hw['device_name']}, Hardware Accel: {hw['has_hardware_acceleration']}")
    print(f"Recommended Codec: {hw['recommended_codec']}")
    assert hw['recommended_codec'] in hw['available_encoders']

    print("\n=== TEST 2: Probe & Validation ===")
    p1 = probe_file(v1)
    p2 = probe_file(v2)
    print(f"V1: {p1['resolution']} @ {p1['fps']} FPS, {p1['video_codec']}, duration: {p1['duration_formatted']}")
    print(f"V2: {p2['resolution']} @ {p2['fps']} FPS, {p2['video_codec']}, duration: {p2['duration_formatted']}")
    assert p1['is_valid'] and p2['is_valid']
    assert p1['resolution'] == "2560x1440"

    validation = validate_merge_compatibility([p1, p2])
    print(f"Validation: can_instant_copy={validation['can_instant_copy']}, badge={validation['badge']}")
    assert validation['can_instant_copy'] is True

    print("\n=== TEST 3: Auto-Naming Heuristics ===")
    name_single = suggest_single_name(v1)
    print(f"Single suggested: {name_single}")
    assert name_single == "CapCut_Ch01-06_Export(compressed).mp4"

    name_merge = suggest_merge_name([v1, v2])
    print(f"Merge suggested: {name_merge}")
    assert name_merge == "Ch01-12(merged).mp4"

    print("\n=== TEST 4: Compression Job (Hardware Accelerated) ===")
    out_comp = os.path.join(test_dir, "output_compressed.mp4")
    async def comp_progress(data):
        if data.get("percentage") is not None:
            print(f"  [Compress Progress] {data['percentage']}% ({data.get('current_time_formatted')})", end="\r")

    comp_job = CompressionJob("test_comp", v1, out_comp, preset="best_2k", progress_callback=comp_progress)
    comp_res = await comp_job.run()
    print(f"\nCompress result: success={comp_res['success']}")
    assert comp_res['success'] is True
    assert os.path.exists(out_comp)

    print("\n=== TEST 5: Instant Merge Job (Lossless Concat) ===")
    out_merge = os.path.join(test_dir, "Ch01-12(merged).mp4")
    async def merge_progress(data):
        if data.get("percentage") is not None:
            print(f"  [Merge Progress] {data['percentage']}% (status: {data.get('status')})", end="\r")

    merge_job = MergeJob("test_merge", [v1, v2], out_merge, mode="instant_copy", progress_callback=merge_progress)
    merge_res = await merge_job.run()
    print(f"\nMerge result: success={merge_res['success']}, mode={merge_res.get('mode')}")
    assert merge_res['success'] is True
    assert os.path.exists(out_merge)

    p_merged = probe_file(out_merge)
    print(f"Merged output duration: {p_merged['duration_formatted']} (expected ~00:04)")
    assert p_merged['duration_sec'] >= 3.5

    print("\n=== TEST 6: Batch Auto-Naming & Sequential Simulation ===")
    from engine.naming import suggest_batch_names
    b_names = suggest_batch_names([v1, v2, "random_video.mp4"])
    print(f"Batch suggested names: {b_names}")
    assert len(b_names) == 3
    assert b_names[0] == "CapCut_Ch01-06_Export(compressed).mp4"
    assert b_names[1] == "Ch07-12(compressed).mp4"
    assert b_names[2] == "random_video(compressed).mp4"

    # Clean up test videos
    shutil.rmtree(test_dir, ignore_errors=True)
    print("\n🎉 ALL PIPELINE TESTS PASSED SUCCESSFULLY! 🎉")


if __name__ == "__main__":
    asyncio.run(run_tests())
