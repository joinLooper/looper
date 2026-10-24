#!/usr/bin/env python3
"""My Forest pot/tree DEV-ONLY importer. Default dry-run, fail closed.
Does NOT approve tree, change the original screenshot, merge or deploy.
"""
from __future__ import annotations
import argparse, hashlib, io, json, sys, zipfile
from pathlib import Path

MOBILE=Path(__file__).resolve().parent.parent
BUNDLE_SHA="86598f41bc3e0b2351c60db09d93cd572d0bd6993c145946c22de6595ae93989"
POT_FILE="app_assets/f1_my_forest_pot_icon_final.png"
TREE_FILE="app_assets/f1_my_forest_tree_icon_final.png"
PINNED={
 POT_FILE:"d8ee877b6720f2892e8ff6803dcb47b05c4f06d1de0e7a1d61cc4fa21f0abf3b",
 TREE_FILE:"fc5ce9453e5a556c577bd3342f1e6e24350728b91d4225274bfb4f4ee",
}
BASELINE_BINDING_SHA="9c78c3fb93f09461bcab4c2ba62e308794a9c6c7a2899a58f57682e00f13393f"
GENERATED=MOBILE/"src/f1-my-forest-pot-tree-qa-art.generated.ts"
TARGET=MOBILE/"assets/f1/my-forest-pot-tree-qa"
SOURCE_NAMES={POT_FILE:"pot.png",TREE_FILE:"tree.png"}

def sha(data:bytes)->str:
    return hashlib.sha256(data).hexdigest()

def generated()->str:
    return ('/** SHA-verified dev-only pot/tree samples. Tree and placement still candidates. */\n'
      'import type {ImageSourcePropType} from "react-native";\n'
      'export const F1_POT_TREE_CANDIDATE_SOURCE_ARCHIVE_SHA =\n'
      '  "'+BUNDLE_SHA+'";\n'
      'export const F1_POT_TREE_QA_IMAGES:Readonly<{\n'
      '  pot:ImageSourcePropType|null;\n'
      '  tree:ImageSourcePropType|null;\n'
      '}>=Object.freeze({\n'
      '  pot:require("../assets/f1/my-forest-pot-tree-qa/pot.png"),\n'
      '  tree:require("../assets/f1/my-forest-pot-tree-qa/tree.png"),\n'
      '});\n')

def verify(archive:Path,expected:str)->dict[str,bytes]:
    if expected.lower()!=BUNDLE_SHA:
        raise ValueError("ARCHIVE_SHA_ARGUMENT_MISMATCH")
    if not archive.is_file() or sha(archive.read_bytes())!=BUNDLE_SHA:
        raise ValueError("ARCHIVE_SOURCE_BYTES_MISSING_OR_CHANGED")
    with zipfile.ZipFile(archive) as z:
        names=z.namelist()
        if len(names)!=16 or len(set(names))!=16 or z.testzip() is not None:
            raise ValueError("ZIP_CRC_OR_MEMBER_SET_INVALID")
        if any(n.startswith("/") or ".." in Path(n).parts or n.endswith("/") for n in names):
            raise ValueError("ZIP_PATH_UNSAFE")
        if sum(f.file_size for f in z.infolist())>25_000_000:
            raise ValueError("ZIP_UNPACKED_SIZE_UNEXPECTED")
        docs={n:z.read(n) for n in names}
    if not set(PINN).issubset(docs) or not {
        "SHA-256.txt","manifest.json","placement.json","state_manifest.json"
    }.issubset(docs):
        raise ValueError("REQUIRED_DELIVERY_FILE_MISSING")
    inv={}
    for line in docs["SHA-256.txt"].decode("utf-8").splitlines():
        digest,name=line.split("  ",1)
        if name in inv:raise ValueError("DUPLICATE_HASH_RECORD")
        inv[name]=digest
    if set(inv)!=set(docs)-{"SHA-256.txt"} or any(
        sha(docs[n])!=digest for n,digest in inv.items()):
        raise ValueError("SHA_INVENTORY_MISMATCH")
    manifest=json.loads(docs["manifest.json"])
    entries=manifest.get("entries")
    if not isinstance(entries,list):raise ValueError("MANIFEST_MISSING")
    if {e["file"] for e in entries}!=set(docs)-{"SHA-256.txt","manifest.json"}:
        raise ValueError("MANIFEST_FILES_MISMATCH")
    if any(sha(docs[e["file"]])!=e["sha256"] or len(docs[e["file"]])!=e["bytes"]
       for e in entries):raise ValueError("MANIFEST_VALUES_MISMATCH")
    placement=json.loads(docs["placement.json"])
    if (placement.get("scene_id")!="forest_clearing" or
        placement.get("visual_state_id")!="V-HUD-CARBONDETAIL" or
        placement.get("source_canvas",{}).get("width")!=941 or
        placement.get("source_canvas",{}).get("height")!=1672 or
        placement.get("status")!="CANDIDATE"):
        raise ValueError("CANDIDATE_SCENE_OR_SOURCE_GEOMETRY_CHANGED")
    from PIL import Image
    for path,expected_sha in PINNED.items():
        if sha(docs[path])!=expected_sha:raise ValueError("APPROVED_ATTACHMENT_SHA_CHANGED:"+path)
        with Image.open(io.BytesIO(docs[path])) as img:
            img.verify()
        with Image.open(io.BytesIO(docs[path])) as img:
            img.load()
            if img.size!=(1254,1254) or img.mode!="RGBA":
                raise ValueError("ICON_DIMENSIONS_OR_ALPHA_INVALID:"+path)
            alpha=img.getchannel("A")
            lo,hi=alpha.getextrema()
            if lo!=0 or hi!=255 or not alpha.getbbox():
                raise ValueError("ICON_NOT_TRUE_ALPHA_SOURCE:"+path)
    return docs

def main()->int:
    arg=argparse.ArgumentParser()
    arg.add_argument("--archive",required=True,type=Path)
    arg.add_argument("--sha",required=True)
    arg.add_argument("--apply",action="store_true")
    a=arg.parse_args()
    docs=verify(a.archive,a.sha)
    before=GENERATED.read_bytes() if GENERATED.is_file() else b""
    desired=generated().encode("utf-8")
    if sha(before) not in {BASELINE_BINDING_SHA,sha(desired)}:
        raise ValueError("DIRTY_QA_GENERATED_DO_NOT_OVERWRITE")
    for src,dest in SOURCE_NAMES.items():
        path=TARGET/dest
        if path.exists() and sha(path.read_bytes())!=PINNED[src]:
            raise ValueError("DIRTY_QA_PNG_DO_NOT_OVERWRITE:"+dest)
    print(json.dumps({"status":"CANDIDATE_QA_SOURCE_VERIFIED",
      "archiveSha":BUNDLE_SHA,"potVisualApproved":True,
      "treeVisualApproved":False,"placementApproved":False,
      "safeToEnableProduction":False,"dryRun":not a.apply},ensure_ascii=False))
    if not a.apply:return 0
    TARGET.mkdir(parents=True,exist_ok=True)
    for src,dest in SOURCE_NAMES.items():
        path=TARGET/dest
        if not path.exists():
            with path.open("xb") as file:
                file.write(docs[src])
        if sha(path.read_bytes())!=PINNED[src]:raise ValueError("COPIED_FILE_SHA_CHANGED")
    if before!=desired:GENERATED.write_bytes(desired)
    print("QA-only PNG imports verified. Not production art.")
    return 0

if __name__=="__main__":
    try:sys.exit(main())
    except (OSError,ValueError,ImportError,KeyError,zipfile.BadZipFile) as exc:
        print("POT_TREE_QA_IMPORT_BLOCKED: "+str(exc),file=sys.stderr)
        sys.exit(2)
