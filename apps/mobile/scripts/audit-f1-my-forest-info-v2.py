#!/usr/bin/env python3
"""Read-only V2 APP_FORMAT_QA. Never unpacks art or updates production assets.

Usage:
  py -3 apps/mobile/scripts/audit-f1-my-forest-info-v2.py "C:\path\F1_MY_FOREST_INFO_REBUILD_02_APP_FORMAT_CANDIDATE_V2.zip"

Dependencies: Python stdlib + existing Pillow (PIL) for COMPLETE PNG decoding.
If Pillow is unavailable, FAIL CLOSED. Do not auto-install or approve scripts.
Successful output is FORMAT_QA_ONLY, not ART_REVIEWED/READY_FOR_INTEGRATION.
"""
from __future__ import annotations

from collections import Counter
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import zipfile

EXPECTED_NAME = "F1_MY_FOREST_INFO_REBUILD_02_APP_FORMAT_CANDIDATE_V2.zip"
EXPECTED_SHA = "100f42e471164131e27188575475f2571964de6db57c2c72488a65ae7d1f78ea"
EXPECTED_FILES = 17
CANVAS = (941, 1672)
GROUP_ASSET_ID = "f1_my_forest_static_character_info_group"
REQUIRED_PNGS = (
    "f1_forest_clearing_base_dim.png",
    "f1_my_forest_stage_01.png",
    *(f"f1_my_forest_stage_{i:02d}_{mode}.png"
      for i in range(2, 6) for mode in ("bright", "dim")),
)
REQUIRED_DOCS = ("placement.json", "state_manifest.json", "manifest.json", "app_format_qa.json", "sha-256.txt")
MAX_UNCOMPRESSED_TOTAL = 500 * 1024 * 1024
MAX_UNCOMPRESSED_FILE = 120 * 1024 * 1024


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def audit(path: Path) -> dict:
    result = {
        "batch": "F1-MY-FOREST-INFO-REBUILD-02",
        "zip_filename": path.name,
        "expected_zip_filename": EXPECTED_NAME,
        "expected_zip_sha256": EXPECTED_SHA,
        "claimed_file_count": EXPECTED_FILES,
        "app_format_qa_reported": "PASSED_BY_HANDOFF_NOT_INDEPENDENTLY_VERIFIED",
        "app_format_qa_independently_verified": False,
        "visual_status": "CANDIDATE",
        "art_reviewed": False,
        "ready_for_integration": False,
        "do_not_promote": True,
        "never_modify_ledger": True,
        "human_check_embedded_text_and_numbers": "REQUIRED",
        "art_content_unchanged_from_prior_zip": "NOT_VERIFIED_WITHOUT_PRIOR_PIXEL_HASHES",
        "file_details": [],
        "errors": [],
        "warnings": [],
        "status": "BLOCKED_SOURCE_NOT_AVAILABLE",
    }
    errors, warnings = result["errors"], result["warnings"]
    if not path.is_file():
        errors.append("V2_ZIP_BYTES_NOT_ACCESSIBLE")
        return result
    if path.name != EXPECTED_NAME:
        warnings.append("ZIP_RENAMED_VERIFY_BY_SHA")

    digest = sha256(path.read_bytes())
    result["observed_zip_sha256"] = digest
    if digest != EXPECTED_SHA:
        errors.append("ZIP_SHA_256_MISMATCH")
        result["status"] = "BLOCKED_ZIP_SHA"
        return result

    try:
        from PIL import Image
    except ImportError:
        errors.append("PILLOW_NOT_AVAILABLE_FULL_PNG_DECODE_CANNOT_BE_INDEPENDENTLY_VERIFIED")
        result["status"] = "BLOCKED_MISSING_IMAGE_DECODER"
        return result

    try:
        with zipfile.ZipFile(path, "r") as archive:
            items = [it for it in archive.infolist() if not it.is_dir()]
            result["actual_file_count"] = len(items)
            if len(items) != EXPECTED_FILES:
                errors.append("FILE_COUNT_EXPECTED_17")
            fullnames = [it.filename.replace("\\", "/") for it in items]
            for name in fullnames:
                parts = name.split("/")
                if name.startswith("/") or ".." in parts or ":" in parts[0]:
                    errors.append(f"UNSAFE_ARCHIVE_PATH:{name}")
            bnames = [name.split("/")[-1].casefold() for name in fullnames]
            count = Counter(bnames)
            duplicates = sorted(n for n, c in count.items() if c != 1)
            if duplicates:
                errors.append(f"DUPLICATE_BASENAMES:{','.join(duplicates)}")
            for name in REQUIRED_PNGS + REQUIRED_DOCS:
                if count[name.casefold()] != 1:
                    errors.append(f"REQUIRED_MEMBER_MISSING_OR_DUPLICATE:{name}")

            if any(it.file_size > MAX_UNCOMPRESSED_FILE for it in items) or (
                sum(it.file_size for it in items) > MAX_UNCOMPRESSED_TOTAL
            ):
                errors.append("UNCOMPRESSED_FILE_SIZE_LIMIT")
                result["status"] = "BLOCKED_ZIP_RESOURCE_LIMIT"
                return result

            damaged = archive.testzip()
            result["zip_crc"] = "PASS" if damaged is None else f"FAIL:{damaged}"
            if damaged:
                errors.append("ZIP_CRC_FAIL")
                result["status"] = "BLOCKED_ZIP_CRC"
                return result

            png_bytes: dict[str, bytes] = {}
            json_docs: dict[str, object] = {}
            inventory = ""
            for item, name, basename in zip(items, fullnames, bnames):
                raw = archive.read(item)
                record = {
                    "archive_member": name,
                    "bytes": len(raw),
                    "sha256": sha256(raw),
                    "crc32": f"{item.CRC:08x}",
                }
                if basename.endswith(".png"):
                    png_bytes[basename] = raw
                    try:
                        with Image.open(io.BytesIO(raw)) as img:
                            img.verify()
                        with Image.open(io.BytesIO(raw)) as img:
                            img.load()  # full RGBA pixels decoded, not just IHDR
                            record["decoded_size"] = list(img.size)
                            record["decoded_mode"] = img.mode
                            record["detected_format"] = img.format
                            if img.format != "PNG" or img.mode != "RGBA":
                                errors.append(f"PNG_NOT_FULL_RGBA:{name}")
                            if basename == "f1_forest_clearing_base_dim.png" and img.size != CANVAS:
                                errors.append("DIM_FOREST_NOT_941x1672")
                    except Exception as exc:
                        errors.append(f"PNG_DECODE_FAILURE:{name}:{type(exc).__name__}")
                if basename in ("placement.json", "state_manifest.json", "manifest.json", "app_format_qa.json"):
                    try:
                        json_docs[basename] = json.loads(raw.decode("utf-8-sig"))
                        record["json_parse"] = "PASS"
                    except (ValueError, UnicodeError):
                        errors.append(f"INVALID_JSON:{name}")
                if basename == "sha-256.txt":
                    try:
                        inventory = raw.decode("utf-8-sig").casefold()
                    except UnicodeError:
                        errors.append("INVALID_SHA_256_TEXT")
                result["file_details"].append(record)

            result["all_png_rgba_decoded"] = (
                all(x.get("detected_format") == "PNG" and x.get("decoded_mode") == "RGBA"
                    for x in result["file_details"] if x["archive_member"].lower().endswith(".png"))
                and len(png_bytes) >= len(REQUIRED_PNGS)
            )
            result["png_file_count"] = len(png_bytes)
            if len(png_bytes) < 11:
                errors.append("STATIC_GROUP_OR_OTHER_PNG_NOT_FOUND_EXPECT_AT_LEAST_11")
            if not result["all_png_rgba_decoded"]:
                errors.append("NOT_ALL_PNG_IMAGES_DECODE_AS_RGBA")
            if len(json_docs) != 4:
                errors.append("MANIFEST_JSON_SET_INCOMPLETE")

            # The inventory can include checksums for extra metadata; all
            # required image digests must at least be present unambiguously.
            listed = Counter(re.findall(r"\b[a-f0-9]{64}\b", inventory))
            missing_hashes = sorted(
                name for name in png_bytes
                if listed[sha256(png_bytes[name])] < 1
            )
            result["required_png_hashes_listed"] = not missing_hashes
            result["required_png_hashes_missing_from_inventory"] = missing_hashes
            if missing_hashes:
                errors.append("SHA_256_INVENTORY_MISSING_REQUIRED_PNG_HASHES")

            # Independently cross-check the supplied JSON assertions. A valid
            # PNG may decode in RGB mode despite a handoff claiming RGBA.
            records = {r["archive_member"].replace("\\\\","/").split("/")[-1].casefold(): r
                       for r in result["file_details"]}
            for doc_name, array_key in (("manifest.json","files"),
                                        ("placement.json","assets")):
                doc=json_docs.get(doc_name)
                entries=doc.get(array_key,[]) if isinstance(doc,dict) else []
                entry_map={str(x.get("file","")).casefold():x
                           for x in entries if isinstance(x,dict)}
                for basename, observed in records.items():
                    if not basename.endswith(".png"): continue
                    metadata=entry_map.get(basename)
                    if metadata is None:
                        errors.append(f"NOT_CATALOGUED:{doc_name}:{basename}")
                        continue
                    if metadata.get("colorMode") != observed.get("decoded_mode"):
                        errors.append(f"COLOR_MODE_MANIFEST_MISMATCH:{doc_name}:{basename}")
                    if metadata.get("sha256","").casefold() != observed["sha256"]:
                        errors.append(f"SHA_MANIFEST_MISMATCH:{doc_name}:{basename}")
                    if [metadata.get("width"),metadata.get("height")] != observed.get("decoded_size"):
                        errors.append(f"SIZE_MANIFEST_MISMATCH:{doc_name}:{basename}")
            qa=json_docs.get("app_format_qa.json")
            qa_crc=(qa.get("checks") or {}).get("zip_crc") if isinstance(qa,dict) else None
            result["reported_zip_crc_in_qa_json"]=qa_crc
            if qa_crc not in ("OK","PASS"):
                errors.append(f"QA_JSON_CRC_NOT_RECONCILED:{qa_crc}")
            placement=json_docs.get("placement.json")
            placement_assets=placement.get("assets",[]) if isinstance(placement,dict) else []
            result["fixed_group_has_placement_geometry"]=any(
                x.get("assetId")==GROUP_ASSET_ID and
                any(k in x for k in ("x","y","anchor","position","scale","transform","rect"))
                for x in placement_assets if isinstance(x,dict)
            )
            if not result["fixed_group_has_placement_geometry"]:
                warnings.append("FIXED_GROUP_1024x1536_NEEDS_POSITION_SCALE_ANCHOR_ON_941x1672")

            manifest_string = json.dumps(json_docs, ensure_ascii=False).casefold()
            result["static_group_asset_id_mentioned_in_manifests"] = (
                GROUP_ASSET_ID in manifest_string
            )
            if GROUP_ASSET_ID not in manifest_string:
                warnings.append("STATIC_GROUP_ID_NOT_OBVIOUS_IN_MANIFEST__MANUAL_MAPPING_REQUIRED")
            result["fixed_group_single_image_mapping"] = "HUMAN_REVIEW_REQUIRED"
            result["stage01_single_default"] = not any(
                basename.startswith("f1_my_forest_stage_01_") for basename in bnames
            )
            if not result["stage01_single_default"]:
                errors.append("STAGE01_MUST_HAVE_ONLY_DEFAULT")
            result["bright_dim_pairs_expected"] = 4
            result["bright_dim_mutually_exclusive_in_runtime"] = (
                "ENFORCED_BY_EXISTING_F1_MY_FOREST_STAGE_CONTRACT"
            )
            if errors:
                result["status"] = "BLOCKED_APP_FORMAT_AUDIT"
            else:
                result["status"] = "APP_FORMAT_QA_INDEPENDENTLY_PASSED__VISUAL_CANDIDATE_ONLY"
                result["app_format_qa_independently_verified"] = True
            return result
    except (OSError, zipfile.BadZipFile, zipfile.LargeZipFile, RuntimeError) as exc:
        errors.append(f"UNREADABLE_ZIP:{type(exc).__name__}")
        result["status"] = "BLOCKED_ZIP_READ"
        return result


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: py -3 audit-f1-my-forest-info-v2.py <V2 ZIP full path>", file=sys.stderr)
        sys.exit(2)
    output = audit(Path(sys.argv[1]))
    print(json.dumps(output, ensure_ascii=False, indent=2))
    sys.exit(0 if output["app_format_qa_independently_verified"] else 2)
