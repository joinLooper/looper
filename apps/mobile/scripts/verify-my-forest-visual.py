#!/usr/bin/env python3
"""Compare an actual Looper My Forest UI capture against the user's approved image.

This is a pixel-composition QA gate, NOT an image generator, asset extractor,
formal resource-ledger reader, or a substitute for human/iPhone signoff.

Source of truth: V-HUD-CARBONDETAIL_APPROVED_VISUAL_REFERENCE_20261024.png
SHA-256: b324e4cc37d52d04ecc730532f027fb990b8cc96e970e5f97916992f14652081

Screenshots may vary in live numbers; those small text/fill areas are masked.
The protected boxes are ONLY comparison windows, never replacement placement.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

EXPECTED_SHA = "b324e4cc37d52d04ecc730532f027fb990b8cc96e970e5f97916992f14652081"
SOURCE_SIZE = (941, 1672)
# Windows are for QA difference metrics only, not App drawing coordinates.
REFERENCE_WINDOWS = {
    "close_control": (741, 136, 878, 279),
    "left_marmot_on_stump": (146, 322, 482, 715),
    "right_wooden_sign": (499, 303, 881, 580),
    "central_sprout": (406, 514, 679, 800),
    "three_column_pale_board": (65, 785, 866, 1057),
    "separate_brown_description_plank": (61, 1049, 867, 1217),
    "five_milestones_below_plank": (93, 1249, 852, 1467),
}
# Ignore only legitimately variable data values. Keep wood, separators, icon
# positions, description plank, and the five-stage arrangement in parity checks.
DYNAMIC_DATA_MASKS = [
    (214, 913, 337, 1024),           # Planted count value on left panel
    (455, 921, 571, 1014),           # Total carbon number
    (612, 913, 827, 1022),           # Current/target and live progress fill
    (112, 1396, 826, 1461),          # Stage status labels/values, not icons
]
ANCHOR_MAX_MEAN_DIFF = 22.0  # pixels 0–255; deliberately stricter than R6


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def round_box(box, scale, origin):
    x0, y0, x1, y1 = box
    left = origin[0] + round(x0 * scale)
    top = origin[1] + round(y0 * scale)
    right = origin[0] + round(x1 * scale)
    bottom = origin[1] + round(y1 * scale)
    return (left, top, right, bottom)


def inspect(reference: Path, rendered: Path, profile: str):
    from PIL import Image, ImageChops, ImageDraw, ImageStat

    output = {
        "schema": "looper.my-forest.canonical-visual-parity.v1",
        "scene_id": "forest_clearing",
        "visual_state_id": "V-HUD-CARBONDETAIL",
        "approved_screenshot_sha256": EXPECTED_SHA,
        "reference_path": str(reference),
        "rendered_path": str(rendered),
        "profile": profile,
        "passed_visual_authority": False,  # Only the user's signoff may set this.
        "passed_iphone_visual_qa": False,
        "runtime_integrated": False,
        "ledger_behavior_verified": False,
        "comparison_only": True,
        "errors": [], "regions": {}, "status": "NOT_CHECKED",
    }
    err = output["errors"]
    if not reference.is_file():
        err.append("APPROVED_REFERENCE_FILE_MISSING")
        output["status"] = "BLOCKED_SOURCE"
        return output
    actual_sha = sha256(reference)
    output["actual_reference_sha256"] = actual_sha
    if actual_sha != EXPECTED_SHA:
        err.append("APPROVED_SCREEN_SHA_MISMATCH")
        output["status"] = "BLOCKED_SOURCE"
        return output
    if not rendered.is_file():
        err.append("RENDERED_CAPTURE_MISSING")
        output["status"] = "BLOCKED_CAPTURE"
        return output
    try:
        with Image.open(reference) as im:
            if im.size != SOURCE_SIZE:
                err.append("REFERENCE_DIMENSIONS_CHANGED")
                output["status"] = "BLOCKED_SOURCE"
                return output
            src = im.convert("RGB")
        with Image.open(rendered) as im:
            im.load()
            w, h = im.size
            output["render_size"] = [w, h]
            output["render_sha256"] = sha256(rendered)
            output["render_alpha_full_coverage"] = "A" not in im.getbands() or im.getchannel("A").getextrema()[0] == 255
            actual_ratio = h / max(w, 1)
            expected_ratio = 16/9 if profile == "9:16" else 19.5/9
            if abs(actual_ratio - expected_ratio) > 0.04:
                err.append("WRONG_PHONE_PROFILE_ASPECT_RATIO")
            if w < 200 or h < 350:
                err.append("RENDERED_CAPTURE_TOO_SMALL")
            if not output["render_alpha_full_coverage"]:
                err.append("RENDERED_CAPTURE_HAS_TRANSPARENT_BARS")
            image = im.convert("RGB")
    except (OSError, ValueError) as exc:
        err.append("UNREADABLE_IMAGE:" + type(exc).__name__)
        output["status"] = "BLOCKED_CAPTURE"
        return output

    # Use one uniform transform, never stretch the source to fit tall displays.
    scale = min(w / SOURCE_SIZE[0], h / SOURCE_SIZE[1])
    sw, sh = round(SOURCE_SIZE[0] * scale), round(SOURCE_SIZE[1] * scale)
    origin = ((w - sw) // 2, (h - sh) // 2)
    output["uniform_scale"] = scale
    output["comparison_origin"] = list(origin)
    output["comparison_content_rect"] = [origin[0], origin[1], sw, sh]
    target = src.resize((sw, sh), Image.Resampling.LANCZOS)
    sample = image.crop((origin[0], origin[1], origin[0] + sw, origin[1] + sh))
    # Variable fields receive the same opaque neutral color in both images.
    target_for_diff, sample_for_diff = target.copy(), sample.copy()
    ref_draw = ImageDraw.Draw(target_for_diff)
    shot_draw = ImageDraw.Draw(sample_for_diff)
    for box in DYNAMIC_DATA_MASKS:
        local = round_box(box, scale, (0, 0))
        ref_draw.rectangle(local, fill=(127, 127, 127))
        shot_draw.rectangle(local, fill=(127, 127, 127))

    failed = []
    for key, box in REFERENCE_WINDOWS.items():
        local = round_box(box, scale, (0, 0))
        ref_area = target_for_diff.crop(local)
        actual_area = sample_for_diff.crop(local)
        diff = ImageChops.difference(ref_area, actual_area)
        mean = sum(ImageStat.Stat(diff).mean[:3]) / 3
        passed = mean <= ANCHOR_MAX_MEAN_DIFF
        output["regions"][key] = {
            "reference_bbox": list(box),
            "mean_abs_rgb_error": round(mean, 3),
            "threshold": ANCHOR_MAX_MEAN_DIFF,
            "status": "SIMILAR" if passed else "COMPOSITION_DIFFERENT",
        }
        if not passed:
            failed.append(key)
    output["unaligned_regions"] = failed
    output["masked_dynamic_fields"] = len(DYNAMIC_DATA_MASKS)
    output["comparison_limitations"] = [
        "Dynamic data, asset provenance and true tap/close functionality require independent testing.",
        "Phone ratios outside the 941x1672 source aspect need human safe-area/camera approval.",
        "Within-threshold similarity is not an art approval or iPhone QA PASS.",
    ]
    if err:
        output["status"] = "BLOCKED_CAPTURE"
    elif failed:
        output["status"] = "COMPOSITION_MISMATCH_DO_NOT_PROMOTE"
    elif profile == "9:19.5":
        output["status"] = "CORE_COMPOSITION_SIMILAR__TALL_ADAPTATION_HUMAN_REVIEW_REQUIRED"
    else:
        output["status"] = "CORE_COMPOSITION_SIMILAR__HUMAN_ART_QA_REQUIRED"
    return output


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reference", required=True, type=Path,
                    help="Byte-exact, user-approved 941x1672 screenshot")
    ap.add_argument("--rendered", required=True, type=Path,
                    help="Actual screen capture of the My Forest page")
    ap.add_argument("--profile", choices=["9:16", "9:19.5"], required=True)
    ap.add_argument("--report", type=Path,
                    help="Optional JSON artifact; does not modify any source image")
    args = ap.parse_args()
    try:
        report = inspect(args.reference, args.rendered, args.profile)
    except ImportError:
        report = {"status":"BLOCKED_PILLOW_REQUIRED","passed_iphone_visual_qa":False,
                  "errors":["PILLOW_NOT_INSTALLED_NO_AUTO_INSTALL"]}
    out = json.dumps(report, ensure_ascii=False, indent=2)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(out + "\n", encoding="utf-8")
    print(out)
    return 0 if report["status"].startswith("CORE_COMPOSITION_SIMILAR") else 2

if __name__ == "__main__":
    sys.exit(main())