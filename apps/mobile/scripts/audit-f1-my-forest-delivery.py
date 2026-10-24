#!/usr/bin/env python3
"""Read-only Looper My Forest delivery audit (R3, R4 and later candidates).

Uses the *delivered* manifest and optional externally pinned ZIP SHA instead of
pretending that every later delivery has the older V2 hash. No extraction,
image editing, ledger writes, repository mutation or Art Final promotion.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
import math
from pathlib import Path, PurePosixPath
import re
import sys
import zipfile

CANVAS = (941, 1672)
SCENE = "forest_clearing"
VISUAL = "V-HUD-CARBONDETAIL"
STAGE_PNGS = ["f1_my_forest_stage_01.png"] + [
    f"f1_my_forest_stage_{i:02d}_{tone}.png"
    for i in range(2, 6) for tone in ("bright", "dim")
]
REQUIRED = {"APP_FORMAT_QA.json", "manifest.json", "placement.json", "state_manifest.json", "SHA-256.txt",
            "f1_forest_clearing_base_dim.png", "f1_my_forest_static_character_info_group.png",
            "f1_my_forest_progress_fill.png", *STAGE_PNGS}
EPS = 1.5


def sha(buf: bytes) -> str:
    return hashlib.sha256(buf).hexdigest()


def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def rect_errors(entry: object, tag: str, canvas=CANVAS):
    if not isinstance(entry, dict):
        return [tag + "_MISSING"]
    missing = [k for k in ("x", "y", "width", "height") if not is_num(entry.get(k))]
    if missing:
        return [tag + "_NO_" + "_".join(missing).upper()]
    x, y, w, h = (entry[k] for k in ("x", "y", "width", "height"))
    errors = []
    if w <= 0 or h <= 0:
        errors.append(tag + "_NONPOSITIVE_SIZE")
    if x < -EPS or y < -EPS or x + w > canvas[0] + EPS or y + h > canvas[1] + EPS:
        errors.append(tag + "_OUTSIDE_SOURCE_CANVAS")
    return errors


def first_image_alpha_report(img):
    from PIL import Image
    a = img.getchannel("A")
    hist = a.histogram()
    min_alpha = next((i for i, v in enumerate(hist) if v), 255)
    top = 0
    while top < img.height and a.crop((0, top, img.width, top + 1)).getextrema()[1] == 0:
        top += 1
    bottom = 0
    while bottom < img.height and a.crop((0, img.height - bottom - 1, img.width, img.height - bottom)).getextrema()[1] == 0:
        bottom += 1
    return {"min_alpha": min_alpha, "fully_transparent_top_rows": top,
            "fully_transparent_bottom_rows": bottom, "fully_opaque": min_alpha == 255}


def audit(path: Path, expected_sha: str | None):
    report = {
        "schema": "looper.my-forest.delivery-audit.v1",
        "archive": path.name, "archive_sha256": None,
        "expected_sha256": expected_sha,
        "source_hash_match": None, "count": 0, "zip_crc": "NOT_CHECKED",
        "decoded_png_count": 0, "png_mode": "NOT_CHECKED",
        "format_pass": False, "layout_pass": False, "art_reviewed": False,
        "ready_for_integration": False, "runtime_integrated": False,
        "errors": [], "layout_blockers": [], "human_review_blockers": [],
        "preview_alpha": {}, "status": "BLOCKED_SOURCE",
    }
    errors, layout, human = report["errors"], report["layout_blockers"], report["human_review_blockers"]
    if not path.is_file():
        errors.append("ARCHIVE_NOT_FOUND")
        return report
    observed_sha = sha(path.read_bytes())
    report["archive_sha256"] = observed_sha
    if expected_sha:
        report["source_hash_match"] = (observed_sha == expected_sha.lower())
        if not report["source_hash_match"]:
            errors.append("EXTERNAL_SOURCE_SHA_MISMATCH")
    else:
        human.append("SOURCE_SHA_NOT_PINNED_TO_CENTRAL_HANDOFF")
    try:
        from PIL import Image, ImageFile
        Image.MAX_IMAGE_PIXELS = 60_000_000
        ImageFile.LOAD_TRUNCATED_IMAGES = False
    except ImportError:
        errors.append("PILLOW_REQUIRED_FOR_FULL_PNG_DECODE")
        return report
    try:
        with zipfile.ZipFile(path) as z:
            names = z.namelist()
            report["count"] = len(names)
            if len(names) > 150 or sum(i.file_size for i in z.infolist()) > 300_000_000:
                errors.append("ZIP_LIMIT_EXCEEDED")
                return report
            if any(n.startswith("/") or "\\" in n or ".." in PurePosixPath(n).parts or n.endswith("/") for n in names):
                errors.append("UNSAFE_ZIP_MEMBER_PATH")
                return report
            if len({n.casefold() for n in names}) != len(names):
                errors.append("DUPLICATE_ZIP_MEMBER_NAME")
                return report
            missing = sorted(REQUIRED.difference(names))
            if missing:
                errors.append("REQUIRED_FILES_MISSING:" + ",".join(missing))
                return report
            bad_crc = z.testzip()
            report["zip_crc"] = "PASS" if bad_crc is None else "FAIL"
            if bad_crc:
                errors.append("ZIP_CRC_FAIL:" + bad_crc)
                return report
            data = {n: z.read(n) for n in names}
            m, p, state, qa = (json.loads(data[n].decode("utf-8")) for n in
                               ("manifest.json", "placement.json", "state_manifest.json", "APP_FORMAT_QA.json"))
            batches = [x.get("batch") for x in (m, p, state, qa)]
            if len(set(batches)) != 1 or not str(batches[0]).startswith("F1-MY-FOREST-INFO-REBUILD-02-"):
                errors.append("BATCH_METADATA_MISMATCH")
            report["batch"] = batches[0]
            if p.get("scene_id") != SCENE or p.get("visual_state_id") != VISUAL:
                errors.append("SCENE_VISUAL_AUTHORITY_MISMATCH")
            canvas = p.get("source_canvas", {})
            if [canvas.get("width"), canvas.get("height")] != list(CANVAS):
                errors.append("SOURCE_CANVAS_MISMATCH")
            entries = {}
            for line in data["SHA-256.txt"].decode("utf-8").splitlines():
                s = re.fullmatch(r"([0-9a-fA-F]{64})  (.+)", line)
                if not s or s.group(2) in entries:
                    errors.append("SHA_INVENTORY_INVALID_OR_DUPLICATED")
                else:
                    entries[s.group(2)] = s.group(1).lower()
            if set(entries) != set(names) - {"SHA-256.txt"}:
                errors.append("SHA_INVENTORY_FILE_SET_MISMATCH")
            for n, declared in entries.items():
                if n in data and sha(data[n]) != declared:
                    errors.append("SHA_MISMATCH:" + n)
            manifest_pngs = {e.get("file"): e for e in m.get("assets", []) if isinstance(e, dict)}
            placement_pngs = {e.get("file"): e for e in p.get("assets", []) if isinstance(e, dict)}
            full_pngs = [n for n in names if n.lower().endswith(".png")]
            for n in full_pngs:
                with Image.open(io.BytesIO(data[n])) as img:
                    img.verify()
                with Image.open(io.BytesIO(data[n])) as img:
                    img.load()
                    size, mode = img.size, img.mode
                    if mode != "RGBA":
                        errors.append("PNG_NOT_RGBA:" + n)
                    for collection, label in ((manifest_pngs, "MANIFEST"), (placement_pngs, "PLACEMENT")):
                        entry = collection.get(n)
                        # Derived previews need not have placement entries; only source PNGs do.
                        if label == "PLACEMENT" and n.startswith("r4_"):
                            continue
                        if not entry:
                            errors.append(f"{label}_PNG_MISSING:{n}")
                        elif (entry.get("sha256") and entry["sha256"] != sha(data[n])) or (entry.get("width"), entry.get("height")) != size:
                            errors.append(f"{label}_PNG_METADATA_MISMATCH:{n}")
                    if n.startswith("r4_recomposition_"):
                        report["preview_alpha"][n] = first_image_alpha_report(img)
                    if n == "f1_forest_clearing_base_dim.png" and size != CANVAS:
                        errors.append("DIM_BACKGROUND_SIZE_NOT_941X1672")
                    report["decoded_png_count"] += 1
            report["png_mode"] = "RGBA" if not any("PNG_NOT_RGBA" in e for e in errors) else "MIXED"
            if state.get("stage01") != "single_default" or state.get("stage02_05") != "bright_dim_mutually_exclusive":
                errors.append("STAGE_STATE_CONTRACT_INVALID")
            if any(n not in names for n in STAGE_PNGS):
                errors.append("STAGE_IMAGES_INCOMPLETE")
            if qa.get("checks", {}).get("zip_crc") not in ("PASS", "OK"):
                errors.append("QA_JSON_CRC_NOT_RECONCILED")
            if qa.get("art_reviewed") is not False or qa.get("ready_for_integration") is not False:
                errors.append("UNAUTHORIZED_ART_READY_ASSERTION")
            group = p.get("fixed_group", {})
            geo = group.get("placement_source_canvas", {})
            layout.extend(rect_errors(geo, "FIXED_GROUP"))
            if not is_num(geo.get("scale")) or geo["scale"] <= 0:
                layout.append("FIXED_GROUP_SCALE_INVALID")
            else:
                source = group.get("source_size", [None, None]); scale = geo["scale"]
                if len(source) != 2 or not all(is_num(x) for x in source) or not all(is_num(geo.get(k)) for k in ("width", "height")):
                    layout.append("FIXED_GROUP_SOURCE_DIMENSIONS_MISSING")
                elif abs(source[0] * scale - geo["width"]) > EPS or abs(source[1] * scale - geo["height"]) > EPS:
                    layout.append("FIXED_GROUP_STRETCH_OR_SCALE_MISMATCH")
            for prop in ("anchor", "pivot"):
                v = geo.get(prop)
                if not isinstance(v, list) or len(v) != 2 or not all(is_num(x) and 0 <= x <= 1 for x in v):
                    layout.append("FIXED_GROUP_" + prop.upper() + "_MISSING")
            if group.get("single_non_splittable") is not True:
                layout.append("FIXED_GROUP_IDENTITY_SPLIT")
            dynamic = p.get("dynamic_slots", {})
            progress = dynamic.get("next_progress_fill")
            layout.extend(rect_errors(progress, "PROGRESS_FILL"))
            if not isinstance(progress, dict) or not isinstance(progress.get("clipRect"), (dict, list)):
                layout.append("PROGRESS_FILL_MISSING_CLIP_RECT")
            milestone = dynamic.get("milestones")
            for i in range(1, 6):
                slot = milestone.get(f"stage{i:02d}") if isinstance(milestone, dict) else None
                layout.extend(rect_errors(slot, f"MILESTONE_STAGE_{i:02d}"))
            # Changing content must not rely on fixed PNG's embedded pixel data.
            text_geometry = dynamic.get("text_numeric", {})
            if not isinstance(text_geometry, dict) or not isinstance(text_geometry.get("slots"), dict) or not text_geometry["slots"]:
                layout.append("DYNAMIC_TEXT_NUMERIC_RECTS_MISSING")
            safe = p.get("safe_area", {}).get("phone_profiles", {})
            expected_previews = {"9:16": (360, 640), "9:19.5": (360, 780)}
            for profile, dims in expected_previews.items():
                record = safe.get(profile, {})
                name = record.get("recomposition")
                if not name or name not in report["preview_alpha"]:
                    layout.append("PHONE_PREVIEW_MISSING:" + profile)
                elif not report["preview_alpha"][name]["fully_opaque"]:
                    a = report["preview_alpha"][name]
                    layout.append(f"PHONE_BACKGROUND_NOT_FULL_BLEED:{profile}:TOP_{a['fully_transparent_top_rows']}:BOTTOM_{a['fully_transparent_bottom_rows']}")
                if record.get("fit") == "contain":
                    layout.append("FULL_PAGE_CONTAIN_NOT_ALLOWED:" + profile)
            for k, v in qa.get("visual_checks", {}).items():
                if k in ("fixed_group_dynamic_progress_cleanup", "dynamic_text_numeric_cleanup", "character_canon", "difference_against_approved_reference") and v != "PASS":
                    human.append(k.upper() + ":" + str(v))
            report["format_pass"] = not errors
            report["layout_pass"] = not layout
            report["status"] = "BLOCKED_FORMAT" if errors else "BLOCKED_RUNTIME_LAYOUT_AND_ART" if layout else "FORMAT_AND_LAYOUT_VERIFIED__ART_REVIEW_PENDING"
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError, zipfile.BadZipFile, zipfile.LargeZipFile) as exc:
        errors.append("AUDIT_UNREADABLE:" + type(exc).__name__ + ":" + str(exc)[:100])
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    parser.add_argument("--expected-sha", help="Externally recorded SHA-256 of the chosen delivery ZIP")
    args = parser.parse_args()
    if args.expected_sha and not re.fullmatch("[0-9a-fA-F]{64}", args.expected_sha):
        parser.error("--expected-sha must be 64 hex characters")
    result = audit(args.archive, args.expected_sha)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result["format_pass"] and result["layout_pass"] else 2


if __name__ == "__main__":
    sys.exit(main())