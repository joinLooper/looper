#!/usr/bin/env python3
"""Install the USER-APPROVED My Forest screenshot into a local QA-only slot.

This is a static visual reference with illustrative numbers, not Runtime art.
Without --apply the script performs read-only verification. It refuses
unknown bytes, conflicting files, or changed generated source. Never touches
the Windows-approved Forest/HUD, formal ledger, PR merge or deployment.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

EXPECTED = "b324e4cc37d52d04ecc730532f027fb990b8cc96e970e5f97916992f14652081"
SOURCE_SIZE = (941, 1672)
APP = Path(__file__).resolve().parent.parent
TARGET = APP / "assets/f1/my-forest-canonical-qa/approved-reference.png"
GENERATED = APP / "src/f1-my-forest-canonical-qa-art.generated.ts"
# SHA-256 of the exact, committed, null-only generated module. A local
# developer edit cannot be overwritten merely because it still contains null.
EMPTY_GENERATED_SHA = "9e9e137a207b95817e4430cd3b4d2d98433728163d37ce5adcba0780538f7719"
REQUIRE_BINDING = 'require("../assets/f1/my-forest-canonical-qa/approved-reference.png")'


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def desired_module() -> str:
    return (
        "/** SHA-verified USER APPROVED screenshot. QA/dev only; not dynamic art. */\n"
        'import type {ImageSourcePropType} from "react-native";\n'
        'export const F1_MY_FOREST_CANONICAL_REFERENCE_SHA = "' + EXPECTED + '";\n'
        "export const F1_MY_FOREST_CANONICAL_REFERENCE_QA: ImageSourcePropType|null="
        + REQUIRE_BINDING + ";\n"
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", type=Path, required=True,
                    help="Local saved copy of approved 941x1672 Library original")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    if not args.source.is_file():
        raise ValueError("APPROVED_REFERENCE_SOURCE_FILE_MISSING")
    observed = sha(args.source)
    if observed != EXPECTED:
        raise ValueError("APPROVED_REFERENCE_SHA_MISMATCH")
    with args.source.open("rb") as f:
        h = f.read(24)
    if (h[:8] != bytes.fromhex("89504e470d0a1a0a") or h[12:16] != b"IHDR"
            or (int.from_bytes(h[16:20], "big"),
                int.from_bytes(h[20:24], "big")) != SOURCE_SIZE):
        raise ValueError("APPROVED_REFERENCE_PNG_DIMENSIONS_CHANGED")
    if TARGET.exists() and sha(TARGET) != EXPECTED:
        raise ValueError("LOCAL_QA_REFERENCE_DIFFERS_DO_NOT_OVERWRITE")
    before = GENERATED.read_text(encoding="utf-8") if GENERATED.exists() else ""
    desired = desired_module()
    if before != desired and hashlib.sha256(before.encode("utf-8")).hexdigest() != EMPTY_GENERATED_SHA:
        raise ValueError("LOCAL_QA_GENERATED_SOURCE_DIRTY_DO_NOT_OVERWRITE")
    print(json.dumps({
        "status": "APPROVED_REFERENCE_QA_VERIFIED",
        "source_sha256": observed,
        "scene_id": "forest_clearing",
        "visual_state_id": "V-HUD-CARBONDETAIL",
        "source_pixels": SOURCE_SIZE,
        "qa_only": True, "sample_numbers_not_ledger": True,
        "dry_run": not args.apply,
        "official_runtime_art_unchanged": True,
    }, ensure_ascii=False))
    if not args.apply:
        return 0
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    if not TARGET.exists():
        # Copy original bytes unchanged; refuse an existing conflicting path.
        with TARGET.open("xb") as dest, args.source.open("rb") as source:
            shutil.copyfileobj(source, dest)
    if sha(TARGET) != EXPECTED:
        raise ValueError("LOCAL_QA_COPY_HASH_MISMATCH")
    if before != desired:
        # File is an isolated QA binding. Formal art binding is NOT touched.
        GENERATED.write_text(desired, encoding="utf-8")
    print("Reference QA slot ready. Use DEV + EXPO_PUBLIC_MY_FOREST_CANONICAL_REFERENCE_QA=1.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError) as exc:
        print("APPROVED_REFERENCE_QA_IMPORT_BLOCKED: " + str(exc), file=sys.stderr)
        sys.exit(2)
