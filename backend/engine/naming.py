"""
Auto-naming heuristic parser for single video compression and marathon merging.
Extracts chapter ranges, part numbers, episode identifiers, and formats clean output filenames.
"""

import re
import os
from typing import List, Optional


def clean_base_name(filename: str) -> str:
    """Removes file extension and common junk prefixes/suffixes (like CapCut_, Export, etc.)."""
    base = os.path.splitext(os.path.basename(filename))[0]
    # Remove common exporter prefixes/suffixes
    base = re.sub(r'^(CapCut_|capcut_|Export_|export_|Raw_|raw_)', '', base)
    base = re.sub(r'(_Export|_export|_Render|_render|_compressed|_master)$', '', base, flags=re.IGNORECASE)
    return base.strip('_ -')


def suggest_single_name(input_path: str, preset_label: str = "compressed") -> str:
    """
    Generates a recommended output filename for a single video compression.
    Simply appends (compressed) to the original filename base.
    Example:
    my-slain-dragon-bride_ch-1-6.mp4 -> my-slain-dragon-bride_ch-1-6(compressed).mp4
    CapCut_Ch01-06_Export.mp4 -> CapCut_Ch01-06_Export(compressed).mp4
    """
    filename = os.path.basename(input_path)
    base, ext = os.path.splitext(filename)
    if not ext:
        ext = ".mp4"
    if not base:
        base = "video"
    return f"{base}({preset_label}){ext}"


def suggest_batch_names(file_paths: List[str], preset_label: str = "compressed") -> List[str]:
    """
    Generates recommended output filenames for batch compression of multiple videos.
    Example:
    [video_a.mp4, video_b.mp4] -> [video_a(compressed).mp4, video_b(compressed).mp4]
    """
    return [suggest_single_name(path, preset_label) for path in file_paths]


_SEQ_RE = re.compile(
    r'^(?P<prefix>.*?)(?P<psep>[_\-\s]*)(?<![A-Za-z])'
    r'(?P<kw>chapter|chp|ch|bab|episode|eps|ep|part|pt)(?P<ksep>[_.\s-]*)'
    r'(?P<start>\d+)(?:[-_](?P<end>\d+))?',
    re.IGNORECASE,
)


def _strip_tags(name: str) -> str:
    """Drops trailing '(compressed)' / '(merged)' style tags."""
    return re.sub(r'\s*\([^)]*\)\s*$', '', name).strip('_ -')


def suggest_merge_name(file_paths: List[str], suffix: str = "merged") -> str:
    """
    Generates the output filename for merging several parts into one video.
    Prefix and chapter style come from the FIRST file; the range spans min start to max end.
    Examples:
    the-end-has-come_ch-1-7(compressed), _ch-8-15(compressed), _ch-16-23(compressed)
        -> the-end-has-come_ch-1-23(merged).mp4
    the-end-has-come_ch-8-15(compressed) + the-file-name-diff_ch-9-20(compressed)
        -> the-end-has-come_ch-8-20(merged).mp4
    [Ch01-06.mp4, Ch07-12.mp4] -> Ch01-12(merged).mp4
    """
    if not file_paths:
        return f"({suffix}).mp4"

    names = [_strip_tags(clean_base_name(f)) for f in file_paths]
    matches = [_SEQ_RE.match(n) for n in names]

    if all(matches):
        first = matches[0]
        starts = [int(m.group('start')) for m in matches]
        ends = [int(m.group('end') or m.group('start')) for m in matches]
        lo, hi = min(starts), max(ends)
        # keep zero-padding style of the first file (Ch01-06 -> Ch01-12)
        width = len(first.group('start')) if first.group('start').startswith('0') else 0
        prefix = first.group('prefix')
        psep = first.group('psep') if prefix else ''
        base = (
            f"{prefix}{psep}{first.group('kw')}{first.group('ksep')}"
            f"{str(lo).zfill(width)}-{str(hi).zfill(width)}"
        )
        return f"{base}({suffix}).mp4"

    # No chapter/part/episode pattern: reuse first file's name
    return f"{names[0] or 'video'}({suffix}).mp4"


if __name__ == "__main__":
    # Test cases
    test1 = "my-slain-dragon-bride_ch-1-6.mp4"
    print("Single 1:", suggest_single_name(test1))  # Expected: my-slain-dragon-bride_ch-1-6(compressed).mp4

    test2 = "CapCut_Ch01-06_Export.mp4"
    print("Single 2:", suggest_single_name(test2))  # Expected: CapCut_Ch01-06_Export(compressed).mp4

    test_merge1 = ["Ch01-06.mp4", "Ch07-12.mp4"]
    print("Merge 1:", suggest_merge_name(test_merge1))  # Expected: Ch01-12(merged).mp4

    test_merge2 = [
        "the-end-has-come_ch-1-7(compressed).mp4",
        "the-end-has-come_ch-8-15(compressed).mp4",
        "the-end-has-come_ch-16-23(compressed).mp4",
    ]
    print("Merge 2:", suggest_merge_name(test_merge2))  # Expected: the-end-has-come_ch-1-23(merged).mp4

    test_batch = ["video_a.mp4", "video_b.mp4"]
    print("Batch:", suggest_batch_names(test_batch))  # Expected: [video_a(compressed).mp4, video_b(compressed).mp4]
