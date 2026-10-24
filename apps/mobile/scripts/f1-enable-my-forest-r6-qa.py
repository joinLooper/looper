#!/usr/bin/env python3
"""R6 original-art QA preview importer. No writes without --apply.

Never edits formal world PNG, approved HUD, R6 ZIP, player ledger, or official
F1 runtime art mapping. Refuses dirty generated source and differing sprites.
This is deliberately a local, dev-only preview—not production promotion.
"""
from __future__ import annotations
import argparse, hashlib, io, json, re, sys, zipfile
from pathlib import Path

THIS=Path(__file__).resolve()
MOBILE=THIS.parent.parent
ROOT=MOBILE.parent.parent
EXPECTED="07d95d741cb2e6ea5a1f82429a7f6d1d79b8c1b4cffe194854ad77133671dc75"
BATCH="F1-MY-FOREST-INFO-REBUILD-02-R6"
GENERATED=MOBILE/"src/f1-my-forest-r6-qa-art.generated.ts"
OUT=MOBILE/"assets/f1/my-forest-r6-qa"
SOURCES=["f1_forest_clearing_base_dim.png","f1_my_forest_static_character_info_group.png",
         "f1_my_forest_progress_fill.png","f1_my_forest_stage_01.png"]+[
         f"f1_my_forest_stage_{i:02d}_{tone}.png" for i in range(2,6) for tone in ("bright","dim")]

def sha(b:bytes):return hashlib.sha256(b).hexdigest()
def read_zip(z):
  with zipfile.ZipFile(z) as f:
    if f.testzip() is not None:raise ValueError("ZIP_CRC_FAILED")
    names=f.namelist()
    if len(names)>100 or len(set(names))!=len(names):raise ValueError("ZIP_MEMBER_SET_INVALID")
    needed=set(SOURCES)|{"manifest.json","placement.json","state_manifest.json","APP_FORMAT_QA.json","SHA-256.txt"}
    if not needed.issubset(names):raise ValueError("R6_REQUIRED_SOURCE_MISSING")
    data={k:f.read(k) for k in names}
    m,p,s,q=(json.loads(data[k]) for k in ("manifest.json","placement.json","state_manifest.json","APP_FORMAT_QA.json"))
    if any(x.get("batch")!=BATCH for x in (m,p,s,q)):raise ValueError("R6_SOURCE_BATCH_MISMATCH")
    if p.get("scene_id")!="forest_clearing" or p.get("visual_state_id")!="V-HUD-CARBONDETAIL":raise ValueError("VISUAL_ID_MISMATCH")
    if q.get("art_reviewed") is not False or q.get("runtime_integrated") is not False:raise ValueError("FORMAL_STATUS_MUST_REMAIN_FALSE")
    hashes={name:digest for digest,name in (line.split("  ",1) for line in data["SHA-256.txt"].decode().splitlines())}
    if set(hashes)!=set(names)-{"SHA-256.txt"}:raise ValueError("SHA_INVENTORY_INCOMPLETE")
    for k,v in hashes.items():
      if sha(data[k])!=v:raise ValueError("ASSET_HASH_MISMATCH:"+k)
    from PIL import Image
    for name in SOURCES:
      with Image.open(io.BytesIO(data[name])) as im:
        im.verify()
      with Image.open(io.BytesIO(data[name])) as im:
        im.load()
        if im.mode!="RGBA":raise ValueError("NOT_RGBA:"+name)
    return data

def generated_content():
  lines=['/** Generated from independently SHA-verified R6 QA ZIP; QA/dev only. */',
  'import type {ImageSourcePropType} from "react-native";',
  'export const F1_MY_FOREST_R6_QA_SOURCE_SHA = "'+EXPECTED+'";',
  'export const F1_MY_FOREST_R6_QA_ART: Readonly<{background:ImageSourcePropType|null; fixedGroup:ImageSourcePropType|null; progressFill:ImageSourcePropType|null; stages:ReadonlyArray<ImageSourcePropType|null>}> = Object.freeze({',
  ' background:require("../assets/f1/my-forest-r6-qa/'+SOURCES[0]+'"),',
  ' fixedGroup:require("../assets/f1/my-forest-r6-qa/'+SOURCES[1]+'"),',
  ' progressFill:require("../assets/f1/my-forest-r6-qa/'+SOURCES[2]+'"),',
  ' stages:Object.freeze([',
  *('  require("../assets/f1/my-forest-r6-qa/'+f+'"),' for f in SOURCES[3:]),
  ' ]),','});','']
  return "\n".join(lines)

def main():
  ap=argparse.ArgumentParser()
  ap.add_argument("--archive",required=True,type=Path)
  ap.add_argument("--sha",required=True)
  ap.add_argument("--apply",action="store_true")
  args=ap.parse_args()
  # The user has locked the actual 941x1672 composition (reference SHA
  # b324e4cc37d52d04ecc730532f027fb990b8cc96e970e5f97916992f14652081).
  # R6 is an alternative arrangement, therefore reject --apply even if its
  # archive is byte-perfect. Dry-run source validation remains read-only.
  if args.apply:
    raise ValueError("R6_VISUAL_COMPOSITION_NOT_APPROVED__DO_NOT_INSTALL")
  if args.sha.lower()!=EXPECTED:raise ValueError("UNEXPECTED_APPROVED_QA_DELIVERY_SHA")
  if sha(args.archive.read_bytes())!=EXPECTED:raise ValueError("ZIP_SHA_MISMATCH")
  data=read_zip(args.archive)
  # No references to approved scene PNGs or QA HUD are ever opened for writing.
  for name in SOURCES:
    t=OUT/name
    if t.exists() and sha(t.read_bytes())!=sha(data[name]):raise ValueError("LOCAL_QA_ART_DIFFERS_DO_NOT_OVERWRITE:"+name)
  current=GENERATED.read_text(encoding="utf-8") if GENERATED.exists() else ""
  desired=generated_content()
  if current!=desired and current and not ('background:null,fixedGroup:null,progressFill:null' in current and 'Array(9).fill(null)' in current):
    raise ValueError("LOCAL_GENERATED_QA_SOURCE_DIRTY_DO_NOT_OVERWRITE")
  print(json.dumps({"status":"VERIFIED_R6_QA_SOURCE","dry_run":not args.apply,
   "sha256":EXPECTED,"sources":len(SOURCES),"target":str(OUT),
   "production_imports_unchanged":True},ensure_ascii=False))
  if not args.apply:return 0
  OUT.mkdir(parents=True,exist_ok=True)
  for name in SOURCES:
    t=OUT/name
    if not t.exists():t.write_bytes(data[name])
  GENERATED.write_text(desired,encoding="utf-8")
  print("QA sources installed. Use EXPO_PUBLIC_MY_FOREST_R6_QA_ART=1 with Expo DEV, never production.")
  return 0
if __name__=="__main__":
  try:sys.exit(main())
  except Exception as e:
    print("R6_QA_IMPORT_BLOCKED: "+str(e),file=sys.stderr);sys.exit(2)