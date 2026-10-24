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


def rects_overlap(a, b, tolerance=0):
    """Detect unapproved text/sprite collisions on the same source canvas."""
    return (a["x"] < b["x"] + b["width"] - tolerance and
            a["x"] + a["width"] > b["x"] + tolerance and
            a["y"] < b["y"] + b["height"] - tolerance and
            a["y"] + a["height"] > b["y"] + tolerance)


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
        "milestone_geometry_count": 0, "dynamic_text_geometry_count": 0,
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
            version_match = re.search(r"-R(\d+)$", str(batches[0]), re.IGNORECASE)
            delivery_prefix = ("r" + version_match.group(1) + "_") if version_match else None
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
                        if label == "PLACEMENT" and re.match(r"r[0-9]+_", n):
                            continue
                        if not entry:
                            errors.append(f"{label}_PNG_MISSING:{n}")
                        elif ((label == "MANIFEST" and entry.get("sha256") != sha(data[n])) or
                              (label == "PLACEMENT" and entry.get("sha256") is not None and
                               entry["sha256"] != sha(data[n])) or
                              (entry.get("width"), entry.get("height")) != size):
                            errors.append(f"{label}_PNG_METADATA_MISMATCH:{n}")
                    if re.match(r"r[0-9]+_recomposition_", n):
                        if img.mode == "RGBA":
                            report["preview_alpha"][n] = {**first_image_alpha_report(img),
                                                            "size": list(size)}
                        else:
                            errors.append("RECOMPOSITION_PREVIEW_NOT_RGBA:" + n)
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
            # Handoff V2/R4 used ready_for_integration; R5 uses five explicitly
            # separate review flags. Either schema must explicitly fail closed.
            ready_flag = (qa.get("ready_for_integration") if "ready_for_integration" in qa
                          else qa.get("asset_ready"))
            if qa.get("art_reviewed") is not False or ready_flag is not False:
                errors.append("UNAUTHORIZED_ART_READY_ASSERTION")
            for status_key in ("runtime_integrated", "function_qa_passed", "iphone_visual_qa_passed"):
                if status_key in qa and qa[status_key] is not False:
                    errors.append("UNAUTHORIZED_CANDIDATE_STATUS:" + status_key)
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
            if not isinstance(progress, dict):
                layout.append("PROGRESS_FILL_MISSING")
            else:
                clip = progress.get("clipRect")
                if not isinstance(clip, list) or len(clip) != 4 or not all(is_num(x) for x in clip):
                    layout.append("PROGRESS_FILL_MISSING_CLIP_RECT")
                elif all(is_num(progress.get(x)) for x in ("x", "y", "width", "height")):
                    expected = [progress["x"], progress["y"],
                                progress["x"]+progress["width"], progress["y"]+progress["height"]]
                    if any(abs(a-b) > EPS for a, b in zip(clip, expected)):
                        layout.append("PROGRESS_FILL_CLIP_RECT_MISMATCH")
                if progress.get("data_source") != "formal_ledger" or progress.get("emptyState") not in (
                        "hidden_when_ledger_unavailable", "pending_when_ledger_unavailable"):
                    layout.append("PROGRESS_FILL_NOT_LEDGER_GATED")
                if progress.get("fillDirection") != "left_to_right" or progress.get("range") != [0, 100]:
                    layout.append("PROGRESS_FILL_RULE_MISSING")
            # R5 deliberately extends the existing placement.json with a keyed
            # milestone_slots section, without duplicating nine rectangles in
            # dynamic_slots.milestones. Verify both identity and geometry.
            milestones = dynamic.get("milestones", {})
            slots = p.get("milestone_slots", {})
            stage_geo = {}
            for i in range(1, 6):
                stage_no = f"stage{i:02d}"
                identities = ([f"f1_my_forest_stage_{i:02d}"] if i == 1 else
                    [f"f1_my_forest_stage_{i:02d}_{tone}" for tone in ("bright", "dim")])
                declared = milestones.get(stage_no, {}) if isinstance(milestones, dict) else {}
                if i == 1:
                    if declared.get("asset_id") != identities[0] or declared.get("state") != "single_default":
                        layout.append("MILESTONE_STAGE_01_IDENTITY_MISMATCH")
                elif (declared.get("bright"), declared.get("dim")) != tuple(identities):
                    layout.append(f"MILESTONE_STAGE_{i:02d}_STATE_MAP_MISMATCH")
                for asset_id in identities:
                    slot = slots.get(asset_id) if isinstance(slots, dict) else None
                    tag = "MILESTONE_" + asset_id.upper()
                    layout.extend(rect_errors(slot, tag))
                    if not isinstance(slot, dict):
                        continue
                    report["milestone_geometry_count"] += 1
                    if (slot.get("asset_id") != asset_id or
                        slot.get("scale_mode") != "uniform" or
                        slot.get("unlock_source") != "formal_resource_ledger" or
                        slot.get("state") != ("single_default" if i == 1 else "bright_dim_mutually_exclusive")):
                        layout.append(tag + "_IDENTITY_OR_RULE_MISMATCH")
                    for point in ("anchor", "pivot"):
                        arr = slot.get(point)
                        if not isinstance(arr, list) or len(arr) != 2 or not all(is_num(a) and 0<=a<=1 for a in arr):
                            layout.append(tag + "_" + point.upper() + "_INVALID")
                    if not rect_errors(slot, tag):
                        stage_geo.setdefault(i, []).append(tuple(slot[k] for k in ("x","y","width","height")))
                if i>=2 and len(stage_geo.get(i,[]))==2 and stage_geo[i][0]!=stage_geo[i][1]:
                    layout.append(f"MILESTONE_STAGE_{i:02d}_BRIGHT_DIM_GEOMETRY_DIFF")
            # R5 source data fields sit in one authoritative map, not the
            # obsolete dynamic_slots.text_numeric.slots alias.
            numbers = p.get("dynamic_text_fields", {})
            required_numbers = (
                "planted_count", "carbon_total", "next_progress_value",
                "milestone_labels", "milestone_values", "description"
            )
            if not isinstance(numbers, dict):
                layout.append("DYNAMIC_TEXT_NUMERIC_RECTS_MISSING")
            else:
                for key in required_numbers:
                    field = numbers.get(key)
                    layout.extend(rect_errors(field, "DYNAMIC_TEXT_"+key.upper()))
                    if isinstance(field, dict):
                        report["dynamic_text_geometry_count"] += 1
                        if (field.get("source") != "formal_ledger" or
                            field.get("align") not in ("left", "center", "right") or
                            not is_num(field.get("safe_width")) or
                            not is_num(field.get("width")) or
                            field["safe_width"] > field["width"] or field["safe_width"] <= 0):
                            layout.append("DYNAMIC_TEXT_"+key.upper()+"_SOURCE_OR_SAFE_WIDTH_INVALID")
            # Static fields and milestone art share the same source canvas.
            # The R5 numbers 1260..1320 and icons 1300..1420 intersect by
            # 20px; report it instead of treating the existence of rectangles
            # as evidence that layout itself is visually correct.
            if isinstance(numbers, dict) and isinstance(slots, dict):
                for text_key in required_numbers:
                    text_slot = numbers.get(text_key)
                    if not isinstance(text_slot, dict) or rect_errors(text_slot, "TEXT"):
                        continue
                    for other_key in required_numbers:
                        if other_key <= text_key:
                            continue
                        other_slot = numbers.get(other_key)
                        if isinstance(other_slot, dict) and not rect_errors(other_slot, "TEXT") and \
                           rects_overlap(text_slot, other_slot):
                            layout.append(f"TEXT_RECT_OVERLAP:{text_key}:{other_key}")
                    for stage in range(1, 6):
                        icon_id = (f"f1_my_forest_stage_{stage:02d}" if stage == 1 else
                                   f"f1_my_forest_stage_{stage:02d}_bright")
                        icon_slot = slots.get(icon_id)
                        if isinstance(icon_slot, dict) and not rect_errors(icon_slot, "ICON") and \
                           rects_overlap(text_slot, icon_slot):
                            layout.append(f"TEXT_SPRITE_RECT_OVERLAP:{text_key}:stage{stage:02d}")
            safe = p.get("safe_area", {}).get("phone_profiles", {})
            expected_previews = {"9:16": (360, 640), "9:19.5": (360, 780)}
            for profile, dims in expected_previews.items():
                record = safe.get(profile, {})
                name = record.get("recomposition")
                observed = report["preview_alpha"].get(name)
                if not name or observed is None:
                    layout.append("PHONE_PREVIEW_MISSING:" + profile)
                else:
                    if delivery_prefix and not name.startswith(delivery_prefix):
                        layout.append("PHONE_PREVIEW_STALE_PRIOR_BATCH:" + profile + ":" + name)
                    if observed["size"] != list(dims):
                        layout.append("PHONE_PREVIEW_DIMENSIONS_MISMATCH:" + profile)
                    if not observed["fully_opaque"]:
                        layout.append(f"PHONE_BACKGROUND_NOT_FULL_BLEED:{profile}:TOP_{observed['fully_transparent_top_rows']}:BOTTOM_{observed['fully_transparent_bottom_rows']}")
                if record.get("fit") == "contain":
                    layout.append("FULL_PAGE_CONTAIN_NOT_ALLOWED:" + profile)
                # Explicitly different scaling rules. One 'cover' for the
                # whole page can silently crop the fixed-group wooden sign.
                if record.get("background_fit") != "cover" or record.get("fixed_group_fit") != "contain":
                    layout.append("PHONE_LAYER_FIT_NOT_SEPARATED:" + profile)
            if qa.get("checks", {}).get("dual_phone_recomposition") in ("PASS", "PASS_PRECHECK") and any(
                i.startswith(("PHONE_PREVIEW_", "PHONE_BACKGROUND_", "FULL_PAGE_", "PHONE_LAYER_")) for i in layout
            ):
                layout.append("LAYOUT_QA_REPORT_CONTRADICTS_SOURCE_EVIDENCE")
            for k, v in qa.get("visual_checks", {}).items():
                if k in ("fixed_group_dynamic_progress_cleanup", "dynamic_text_numeric_cleanup",
                         "green_progress_removed_from_fixed_group", "dynamic_content_removed",
                         "character_canon", "difference_against_approved_reference",
                         "difference_comparison") and v != "PASS":
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