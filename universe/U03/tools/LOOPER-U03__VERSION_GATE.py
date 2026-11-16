#!/usr/bin/env python3
"""U03-only source and generation isolation. Stdlib; no source files are modified."""
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_NAME = "LOOPER-U03"
EXPECTED_SCENES = ["forest_clearing", "treehouse_main"]
REQUIRED_RULES = {
    "product": "SINGLE_IMMERSIVE_APP",
    "visualDepth": "LOOKS_LIKE_2_5D_ONLY",
    "characterMotion": "FIXED_SLOT_SMALL_LOOP_ONLY",
    "navigation": "SCENE_SWITCH_ONLY",
    "worldScenes": EXPECTED_SCENES,
}
FORBIDDEN = ("LOOPER-U01", "LOOPER-U02", "BIRTHDAY", "APP_MVP", "LEGACY_W2_ART")
SHA_PATTERN = re.compile(r"^[0-9a-f]{64}$")
ASSET_PREFIX = re.compile(r"^LOOPER-U03__[A-Z0-9_]+__[A-Za-z0-9_-]+__[A-Z0-9_]+__R[0-9]{2,}\.[A-Za-z0-9]+$")

def verify(data, base: Path) -> tuple[list[str], list[str]]:
    errors, hold = [], []
    if data.get("schema") != "LOOPER-U03-SOURCE-REGISTRY-01":
        errors.append("U03_SCHEMA_REQUIRED")
    if data.get("sourceGeneration") != EXPECTED_NAME or data.get("productionStatus") != "ACTIVE_ONLY":
        errors.append("ONLY_U03_CAN_BE_ACTIVE")
    if data.get("runtimeRules") != REQUIRED_RULES:
        errors.append("IMMERSIVE_U03_FIXED_SCENE_RUNTIME_REQUIRED")
    if data.get("exclusionPolicy") != "NO_U01_U02_ART_NO_AUTOFILL_FROM_EXISTING_APPS_MOBILE":
        errors.append("LEGACY_ART_MUST_REMAIN_ISOLATED")
    expected_forbidden = set(FORBIDDEN)
    if set(data.get("forbiddenInputs") or []) != expected_forbidden:
        errors.append("ARCHIVE_INPUT_DENYLIST_REQUIRED")
    accepted = data.get("approvedToShow")
    if not isinstance(accepted, list):
        errors.append("approvedToShow MUST BE AN ARRAY")
        return errors, hold
    seen = set()
    asset_root = (base / "assets").resolve()
    for item in accepted:
        if not isinstance(item, dict):
            errors.append("BAD_ASSET_ENTRY")
            continue
        name = item.get("fileName")
        version = item.get("sourceGeneration")
        source = item.get("sourceFile")
        asset_id = item.get("assetId")
        if version != EXPECTED_NAME:
            errors.append("ASSET_MUST_HAVE_EXPLICIT_U03_GENERATION")
        if not isinstance(name, str) or not ASSET_PREFIX.fullmatch(name):
            errors.append("U03_FILE_NAME_REQUIRED")
            continue
        if name in seen:
            errors.append("DUPLICATE_ASSET_FILE")
        seen.add(name)
        if not isinstance(asset_id, str) or not asset_id.strip():
            errors.append("EXISTING_ASSET_ID_REQUIRED")
        if not isinstance(source, str) or not source:
            errors.append("SOURCE_PATH_REQUIRED")
            continue
        if (any(term.casefold() in (name+" "+source).casefold() for term in FORBIDDEN)
            or "apps/mobile/assets" in source.casefold().replace("\\", "/")):
            errors.append("ARCHIVED_INPUT_NOT_ELIGIBLE")
            continue
        src = (base / source).resolve()
        if not src.is_relative_to(asset_root) or not src.is_file():
            errors.append("U03_SOURCE_MUST_LIVE_UNDER_U03_ASSETS")
            continue
        digest = item.get("sourceSha256")
        if not isinstance(digest,str) or not SHA_PATTERN.fullmatch(digest):
            errors.append("VALID_SHA256_REQUIRED")
        elif hashlib.sha256(src.read_bytes()).hexdigest() != digest:
            errors.append("SOURCE_SHA_MISMATCH")
        if item.get("editableMasterVerified") is not True or item.get("founderArtApproved") is not True:
            errors.append("NO_ART_APPROVAL_WITHOUT_SOURCE_AND_FOUNDER")
        if not item.get("visualPreview"):
            hold.append(name + ": visible image or motion proof missing")
    if not accepted:
        hold.append("U03_AUTHORIZED_ART_MANIFEST_EMPTY")
    for p in data.get("awaitingSourceProof", []):
        if p.get("status", "").startswith("U03_"):
            hold.append(p.get("sceneId") or p.get("assetId") or "unknown" + ": SOURCE_PENDING")
    if data.get("deviceQaVerified") is not True:
        hold.append("IPHONE_REAL_DEVICE_NOT_VERIFIED")
    return errors, hold

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--registry", default=str(ROOT / "LOOPER-U03__ASSET_MANIFEST.json"))
    parser.add_argument("--mode", choices=["structure","release"], default="structure")
    args = parser.parse_args()
    try:
        data=json.loads(Path(args.registry).read_text(encoding="utf-8"))
        errors, hold=verify(data,ROOT)
    except (OSError,ValueError,TypeError) as exc:
        errors,hold=[str(exc)],[]
    state="INVALID" if errors else "U03_RELEASE_HOLD" if args.mode=="release" and hold else "U03_STRUCTURE_PASS_ART_NOT_APPROVED" if hold else "PASS"
    print(json.dumps({"status":state,"generation":"LOOPER-U03","errors":errors,"holds":hold,"approvedToShowCount":len(data.get("approvedToShow",[])) if not errors else 0},ensure_ascii=False,indent=2))
    return 2 if errors else 4 if args.mode=="release" and hold else 0

if __name__ == "__main__":
    raise SystemExit(main())
