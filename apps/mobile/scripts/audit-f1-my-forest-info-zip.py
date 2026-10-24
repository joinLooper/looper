#!/usr/bin/env python3
"""Read-only audit for F1_MY_FOREST_INFO_REBUILD_02_CANDIDATE.zip.

This NEVER copies art into runtime and NEVER grants ART_REVIEWED.
Usage: py -3 apps/mobile/scripts/audit-f1-my-forest-info-zip.py C:\\path\\F1_MY_FOREST_INFO_REBUILD_02_CANDIDATE.zip
"""
import hashlib
import json
import os
import pathlib
import struct
import sys
import zipfile

EXPECTED_ZIP = "501b2697740e276d8b90e78ed698d8b39cd34e90fd4c1dd4731a365f9d073204"
REQUIRED = [
    "f1_forest_clearing_base_dim.png",
    "f1_my_forest_stage_01.png",
    *[f"f1_my_forest_stage_{n:02d}_{mode}.png"
      for n in range(2, 6) for mode in ("bright", "dim")],
]
STATIC_GROUP_ID = "f1_my_forest_static_character_info_group"


def audit(path: pathlib.Path):
    if not path.is_file():
        return {"status": "SOURCE_NOT_AVAILABLE", "source": str(path),
                "art_status": "VISUAL_CANDIDATE", "art_reviewed": False}
    raw = path.read_bytes()
    checksum = hashlib.sha256(raw).hexdigest()
    result = {
        "batch": "F1-MY-FOREST-INFO-REBUILD-02",
        "source": str(path),
        "sha256": checksum,
        "expected_sha256": EXPECTED_ZIP,
        "zip_sha_match": checksum == EXPECTED_ZIP,
        "art_status": "VISUAL_CANDIDATE",
        "art_reviewed": False,
        "ingest_ready": False,
        "only_for_qa": True,
        "dynamic_text_or_numbers_visually_clean": "HUMAN_REVIEW_REQUIRED",
        "fixed_group_can_be_split": False,
        "files": [],
    }
    if checksum != EXPECTED_ZIP:
        result["status"] = "BLOCKED_ZIP_SHA_MISMATCH"
        return result
    try:
        with zipfile.ZipFile(path, "r") as z:
            corrupt = z.testzip()
            if corrupt:
                result["status"] = "BLOCKED_ZIP_CRC"
                result["crc_failed_member"] = corrupt
                return result
            infos = [i for i in z.infolist() if not i.is_dir()]
            basename = {}
            for i in infos:
                name = i.filename.replace("\\", "/")
                base = name.split("/")[-1].lower()
                basename.setdefault(base, []).append(name)
                rec = {"name": name, "uncompressed_bytes": i.file_size,
                       "crc32": f"{i.CRC:08x}"}
                if base.endswith(".png"):
                    with z.open(i) as stream:
                        header = stream.read(26)
                    if header[:8] == b"\x89PNG\r\n\x1a\n" and header[12:16] == b"IHDR":
                        rec["png_size"] = list(struct.unpack(">II", header[16:24]))
                        rec["png_color_type"] = header[25]
                    else:
                        rec["png_header_valid"] = False
                result["files"].append(rec)
            missing = [name for name in REQUIRED if name.lower() not in basename]
            duplicates = {name: paths for name, paths in basename.items()
                          if len(paths) > 1 and name in [k.lower() for k in REQUIRED]}
            result["required_names_present"] = not missing
            result["required_names_missing"] = missing
            result["duplicate_stage_filenames"] = duplicates
            result["dim_background_candidates"] = basename.get("f1_forest_clearing_base_dim.png", [])
            result["static_group_mapping_state"] = (
                "IDENTITY_PRESENT_NEEDS_HUMAN_APPROVAL"
                if any(STATIC_GROUP_ID in path.lower() for path in basename.values() for path in path)
                else "ASSET_ID_NOT_CONFIRMED_FROM_FILENAMES__CHECK_MANIFEST")
            result["stage01_has_only_default"] = (
                not any(f"f1_my_forest_stage_01_{status}.png" in basename
                        for status in ("bright", "dim")))
            result["source_canvas"] = [941, 1672]
            dim = result["dim_background_candidates"]
            if dim:
                matched = next((x for x in result["files"] if x["name"] == dim[0]), None)
                result["dim_image_dimensions_match"] = matched and matched.get("png_size") == [941, 1672]
            else:
                result["dim_image_dimensions_match"] = False
            result["status"] = "CANDIDATE_BYTES_AUDITED__ART_REVIEW_REQUIRED"
            if missing or duplicates or result["stage01_has_only_default"] is not True or not result["dim_image_dimensions_match"]:
                result["status"] = "BLOCKED_FILE_SET_OR_DIMENSIONS"
    except (OSError, zipfile.BadZipFile, RuntimeError) as exc:
        result["status"] = "BLOCKED_ZIP_READ"
        result["reason"] = str(exc)
    return result


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python audit-f1-my-forest-info-zip.py <exact ZIP file>", file=sys.stderr)
        sys.exit(2)
    output = audit(pathlib.Path(sys.argv[1]))
    print(json.dumps(output, ensure_ascii=False, indent=2))
    sys.exit(0 if output["status"] == "CANDIDATE_BYTES_AUDITED__ART_REVIEW_REQUIRED" else 2)
