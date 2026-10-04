"""VitalLens rPPG runner (local mode, method='pos').

Runs VitalLens on a video file and prints a single JSON object to stdout
(logs go to stderr). No API key required in local POS mode.

Usage (from admin-app/):
    python scripts/vital_signs_runner.py <video_path>

Output shape:
    {"ok": true,  "method": "vitallens-pos", "vitals": {"hr": {...}, "rr": {...}, "spo2": {...}}}
    {"ok": false, "error": "...", "stage": "load|inference|ffmpeg"}

ffmpeg/ffprobe are located automatically:
    1. env VITALSIGNS_FFMPEG_BIN
    2. admin-app/server/bin (next to this repo layout)
    3. system PATH
"""

import json
import os
import shutil
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
APP_DIR = SCRIPT_DIR.parent
REPO_DIR = APP_DIR.parent
FALLBACK_FFMPEG_BIN = APP_DIR / "server" / "bin"


def ensure_ffmpeg_on_path() -> str | None:
    """Make sure ffprobe/ffmpeg are importable via subprocess; return the bin dir used."""
    candidates = []
    env_bin = os.environ.get("VITALSIGNS_FFMPEG_BIN")
    if env_bin:
        candidates.append(Path(env_bin))
    candidates.append(FALLBACK_FFMPEG_BIN)
    for candidate in candidates:
        if (candidate / "ffprobe.exe").exists() or (candidate / "ffprobe").exists():
            os.environ["PATH"] = str(candidate) + os.pathsep + os.environ.get("PATH", "")
            return str(candidate)
    if shutil.which("ffprobe"):
        return "system-path"
    return None


def summarize_vitals(results: list) -> dict:
    """Extract the vitals we care about from a VitalLens result list (first face)."""
    result = results[0] if results else {}
    vitals = result.get("vitals") or {}
    summary = {}

    hr = vitals.get("heart_rate")
    if hr and hr.get("value") is not None:
        summary["hr"] = {
            "value": round(float(hr["value"]), 1),
            "confidence": float(hr.get("confidence") or 0),
            "unit": hr.get("unit", "bpm"),
        }

    rr = vitals.get("respiration_rate")
    if rr and rr.get("value") is not None:
        summary["rr"] = {
            "value": round(float(rr["value"]), 1),
            "confidence": float(rr.get("confidence") or 0),
            "unit": rr.get("unit", "breaths per minute"),
        }

    spo2 = vitals.get("spo2")
    if spo2 and spo2.get("value") is not None:
        summary["spo2"] = {
            "value": round(float(spo2["value"]), 1),
            "confidence": float(spo2.get("confidence") or 0),
            "unit": spo2.get("unit", "%"),
        }

    return summary


MAX_DURATION_SECONDS = 90  # ระบบวัดจริงใช้คลิป ~30 วิ — ยาวกว่านี้ถือว่านอกขอบเขตการใช้งาน


def probe_duration_seconds(video_path: str) -> float | None:
    """อ่านความยาววิดีโอด้วย ffprobe (format=duration) — ใช้เป็น duration limit"""
    import subprocess

    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", video_path],
            check=True, timeout=30, capture_output=True, text=True,
        )
        return float(result.stdout.strip())
    except Exception:
        return None


def normalize_video(video_path: str) -> str:
    """MediaRecorder (webm) writes variable-frame-rate video that breaks vitallens'
    fps probing. Re-encode to constant-fps mp4 with ffmpeg; on failure return
    empty string (= broken/undecodable video — caller rejects instead of guessing)."""
    import subprocess

    base = Path(video_path)
    normalized = str(base.with_name(f"{base.stem}_cfr.mp4"))
    try:
        subprocess.run(
            [
                "ffmpeg", "-y", "-loglevel", "error", "-i", video_path,
                "-vf", "fps=25", "-pix_fmt", "yuv420p", normalized,
            ],
            check=True,
            timeout=180,
            capture_output=True,
        )
        return normalized
    except Exception:
        return ""


def main() -> int:
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "missing video path argument", "stage": "load"}))
        return 2

    video_path = sys.argv[1]
    if not Path(video_path).exists():
        print(json.dumps({"ok": False, "error": f"video not found: {video_path}", "stage": "load"}))
        return 2

    ffmpeg_bin = ensure_ffmpeg_on_path()
    if not ffmpeg_bin:
        print(json.dumps({"ok": False, "error": "ffmpeg/ffprobe not found", "stage": "ffmpeg"}))
        return 2

    try:
        from vitallens import Method, VitalLens
    except Exception as exc:  # pragma: no cover - environment issue
        print(json.dumps({"ok": False, "error": f"vitallens import failed: {exc}", "stage": "load"}))
        return 2

    try:
        detector = VitalLens(method=Method.POS, export_to_json=False)

        # duration limit — วิดีโอยาวเกินขอบเขต = ปฏิเสธ (ไม่ประมวลผล)
        duration = probe_duration_seconds(video_path)
        if duration is not None and duration > MAX_DURATION_SECONDS:
            print(json.dumps({
                "ok": False,
                "error": f"video too long ({int(duration)}s, max {MAX_DURATION_SECONDS}s)",
                "stage": "validation",
            }))
            return 3

        # decode validation — แปลง VFR→CFR ไม่สำเร็จ = ไฟล์เสีย/ไม่รองรับ (ไม่ป้อนของเสียให้ vitallens)
        normalized = normalize_video(video_path)
        if not normalized:
            print(json.dumps({
                "ok": False,
                "error": "broken or undecodable video",
                "stage": "validation",
            }))
            return 3

        results = detector(normalized)
        vitals = summarize_vitals(results)
        if not vitals:
            # e.g. no face detected / signal too weak — a soft failure the caller can fall back from
            print(
                json.dumps(
                    {
                        "ok": False,
                        "error": "no usable vitals (face not detected or signal too weak)",
                        "stage": "inference",
                    }
                )
            )
            return 3
        print(json.dumps({"ok": True, "method": "vitallens-pos", "ffmpegBin": ffmpeg_bin, "vitals": vitals}))
        return 0
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)[:500], "stage": "inference"}))
        return 1


if __name__ == "__main__":
    sys.exit(main())
