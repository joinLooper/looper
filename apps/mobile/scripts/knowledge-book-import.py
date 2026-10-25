"""SHA-pinned, read-before-write R2/R3 source importer. Private bytes stay local.

python apps/mobile/scripts/knowledge-book-import.py --source HANDOFF.zip --out output/knowledge-book-sources
No download, pixel edits, art approval, or parallel Asset Register is performed.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import stat
import zipfile

PINNED = {
    "21636c0a0115ecb1107b7817aafa30e013b17c6341bc1dded51b02c623a60d72": "COMBINED_REVIEW",
    "39b5617d7cd3d5ddb96a928cf5c20a2344c2f4ef087757edf963800419806dfa": "APP_QA_HANDOFF_V1",
}
MAX_BYTES = 1024 * 1024 * 1024
MAX_ENTRIES = 10000

def sha(data):
    return hashlib.sha256(data).hexdigest()

def validate_archive(data, label="source", depth=0, budget=None):
    if depth > 4:
        raise ValueError("nested archive depth exceeds limit")
    budget = budget if budget is not None else {"bytes": 0, "entries": 0}
    entries, packages, contracts = [], [], []
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        seen = set()
        for info in archive.infolist():
            name = info.filename.replace("\\", "/")
            path = PurePosixPath(name)
            if path.is_absolute() or ".." in path.parts or ":" in name or "\x00" in name or not path.parts:
                raise ValueError("unsafe archive path")
            if stat.S_ISLNK(info.external_attr >> 16):
                raise ValueError("symlink archive member")
            key = name.casefold()
            if key in seen:
                raise ValueError("duplicate archive member")
            seen.add(key)
            budget["bytes"] += info.file_size
            budget["entries"] += 1
            if budget["bytes"] > MAX_BYTES or budget["entries"] > MAX_ENTRIES:
                raise ValueError("archive extraction budget exceeded")
            if info.is_dir():
                continue
            content = archive.read(info)  # ZipFile validates each member CRC.
            entries.append({"path": name, "sha256": sha(content), "bytes": len(content), "crc32": f"{info.CRC:08x}"})
            if path.name in ("placement.json", "state_manifest.json", "hitbox.json"):
                json.loads(content.decode("utf-8-sig"))
                contracts.append(f"{label}/{name}")
            if path.suffix.lower() == ".zip":
                nested = validate_archive(content, f"{label}/{name}", depth + 1, budget)
                contracts.extend(nested["contracts"])
                packages.extend(nested["packages"])
                role = re.search(r"(?:^|[^A-Za-z0-9])R([23])(?:[^0-9]|$)", path.stem, re.I)
                # A combined R2_R3 ZIP is a container, never an independent R2 source.
                if role and not re.search(r"R2.*R3|R3.*R2", path.stem, re.I):
                    packages.append({"role": "R" + role.group(1), "path": f"{label}/{name}", "sha256": sha(content), "bytes": len(content)})
        bad = archive.testzip()
        if bad:
            raise ValueError("CRC failed: " + bad)
    return {"entries": entries, "packages": packages, "contracts": contracts}

def import_source(source, output):
    source, output = Path(source).resolve(), Path(output).resolve()
    data = source.read_bytes()
    fingerprint = sha(data)
    if fingerprint not in PINNED:
        raise ValueError("SOURCE_SHA_MISMATCH: no files extracted")
    audit = validate_archive(data)
    for role in ("R2", "R3"):
        if not any(package["role"] == role for package in audit["packages"]):
            raise ValueError("INDEPENDENT_SOURCE_NOT_FOUND: " + role)
    # Prevent private PNG/ZIP files being accidentally tracked in the public repo.
    root = Path(__file__).resolve().parents[3]
    if output == root or root in output.parents:
        local_output = root / "output"
        if output != local_output and local_output not in output.parents:
            raise ValueError("PRIVATE_OUTPUT_MUST_BE_OUTSIDE_REPO_OR_UNDER_IGNORED_OUTPUT")
    if output.exists():
        raise ValueError("OUTPUT_ALREADY_EXISTS: never overwrite source artifacts")
    output.mkdir(parents=True)
    original = output / source.name
    original.write_bytes(data)
    if sha(original.read_bytes()) != fingerprint:
        raise ValueError("COPY_VERIFICATION_FAILED")
    # Original R2/R3 ZIPs remain byte-for-byte in their container; do not merge identities.
    audit.update({"sourceSha256": fingerprint, "sourceKind": PINNED[fingerprint], "crc": "PASS", "sourceCopy": original.name, "bookMaster": "ART_BLOCKED_NATIVE_BOOK_LAYERS_MISSING", "assetReady": False, "runtimeIntegrated": False})
    (output / "source-verification.json").write_text(json.dumps(audit, indent=2, ensure_ascii=False), encoding="utf-8")
    return {"status": "SOURCE_VERIFIED_LOCAL_ONLY", "sha256": fingerprint, "packages": audit["packages"], "output": str(output), "runtimeIntegrated": False}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(import_source(args.source, args.out), ensure_ascii=False))
    except (ValueError, OSError, zipfile.BadZipFile, RuntimeError) as error:
        parser.exit(2, f"SOURCE_IMPORT_BLOCKED: {error}\n")
