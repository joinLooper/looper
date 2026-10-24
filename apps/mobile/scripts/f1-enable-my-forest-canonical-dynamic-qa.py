#!/usr/bin/env python3
"""Fail-closed, SHA-pinned QA-only import. Dry-run default. No production writes."""
from __future__ import annotations
import argparse,hashlib,io,json,sys,zipfile,shutil
from pathlib import Path

APP=Path(__file__).resolve().parent.parent
ARCHIVE_SHA="a22be2a48a05710b57597539a8094745b72b17dfc5a9a1c7a5f5cf4a633fba94"
SOURCE_SHA="b324e4cc37d52d04ecc730532f027fb990b8cc96e970e5f97916992f14652081"
NEUTRAL_SHA="9cade6ab742dc14cef5188dc7cd0ac2ca094df8a58067b6fa5b97030566f21b7"
SOURCE_NAME="V_HUD_CARBONDETAIL_APPROVED_ORIGINAL.png"
NEUTRAL_NAME="V_HUD_CARBONDETAIL_DERIVED_QA_EMPTY_VALUES.png"
DEST=APP/"assets/f1/my-forest-canonical-dynamic-qa"/"neutral-source.png"
GENERATED=APP/"src/f1-my-forest-canonical-dynamic-qa-art.generated.ts"
REQUIRE='require("../assets/f1/my-forest-canonical-dynamic-qa/neutral-source.png")'

def sha(data:bytes)->str:return hashlib.sha256(data).hexdigest()

def desired():
  return ('/** SHA-pinned My Forest dynamic QA only; not approved production art. */\n'
    'import type {ImageSourcePropType} from "react-native";\n'
    f'export const F1_MY_FOREST_CANONICAL_DYNAMIC_QA_SOURCE_SHA = "{ARCHIVE_SHA}";\n'
    f'export const F1_MY_FOREST_CANONICAL_DYNAMIC_QA_IMAGE: ImageSourcePropType|null={REQUIRE};\n')

def main()->int:
  arg=argparse.ArgumentParser()
  arg.add_argument('--archive',type=Path,required=True)
  arg.add_argument('--sha',required=True)
  arg.add_argument('--apply',action='store_true')
  args=arg.parse_args()
  if args.sha.lower()!=ARCHIVE_SHA:raise ValueError("UNEXPECTED_DYNAMIC_QA_ARCHIVE_SHA")
  if sha(args.archive.read_bytes())!=ARCHIVE_SHA:raise ValueError("ARCHIVE_SHA_MISMATCH")
  with zipfile.ZipFile(args.archive) as z:
    if z.testzip():raise ValueError("ZIP_CRC_FAIL")
    docs={n:z.read(n) for n in z.namelist()}
  if set(docs)!={SOURCE_NAME,NEUTRAL_NAME,'QA_CONTRACT.json','SHA256SUMS.txt'}:
    raise ValueError('QA_ARCHIVE_MEMBER_SET_CHANGED')
  contract=json.loads(docs['QA_CONTRACT.json'])
  if (contract.get('authority_sha256')!=SOURCE_SHA or
      contract.get('underlay_sha256')!=NEUTRAL_SHA or
      contract.get('outside_masks_pixel_equal') is not True or
      contract.get('derived_status')!='ART_CANDIDATE_DYNAMIC_QA_ONLY'):
    raise ValueError('CANONICAL_VISUAL_CONTRACT_CHANGED')
  if sha(docs[SOURCE_NAME])!=SOURCE_SHA or sha(docs[NEUTRAL_NAME])!=NEUTRAL_SHA:
    raise ValueError('SOURCE_OR_DERIVED_PIXEL_SHA_MISMATCH')
  hashes=dict((n,h) for h,n in (line.split('  ',1) for line in docs['SHA256SUMS.txt'].decode().splitlines()))
  if set(hashes)!=set(docs)-{'SHA256SUMS.txt'} or any(sha(docs[n])!=h for n,h in hashes.items()):
    raise ValueError('SHA256SUMS_INVALID')
  from PIL import Image, ImageChops, ImageDraw
  pics={}
  for name in (SOURCE_NAME,NEUTRAL_NAME):
    with Image.open(io.BytesIO(docs[name])) as im:
      im.load()
      if im.mode!='RGBA' or im.size!=(941,1672):raise ValueError('QA_IMAGE_FORMAT_MISMATCH')
      pics[name]=im.copy()
  # Never trust a boolean written in the source ZIP. Recompute exact pixel
  # equivalence OUTSIDE four independently allowed numeric/progress rectangles.
  protected_boxes={
    'planted_value':[207,910,337,1030],
    'carbon_value':[450,910,582,1030],
    'next_progress_value':[611,910,817,977],
    'progress_track':[615,972,807,1022],
  }
  if contract.get('permitted_dynamic_only_rectangles')!=protected_boxes:
    raise ValueError('DYNAMIC_PATCH_REGION_AUTHORITY_MISMATCH')
  orig=pics[SOURCE_NAME];derived=pics[NEUTRAL_NAME]
  if orig.getchannel('A').tobytes()!=derived.getchannel('A').tobytes():
    raise ValueError('ORIGINAL_ALPHA_MODIFIED')
  allowed=Image.new('L',orig.size,0)
  paint=ImageDraw.Draw(allowed)
  for l,t,r,b in protected_boxes.values():paint.rectangle((l,t,r-1,b-1),fill=255)
  rgb_difference=ImageChops.difference(orig.convert('RGB'),derived.convert('RGB')).convert('L')
  if ImageChops.subtract(rgb_difference,allowed).getbbox():
    raise ValueError('CANONICAL_SCENE_PIXELS_CHANGED_OUTSIDE_DYNAMIC_FIELDS')
  if DEST.exists() and sha(DEST.read_bytes())!=NEUTRAL_SHA:
    raise ValueError('LOCAL_QA_ART_DIFFERS_DO_NOT_OVERWRITE')
  before=GENERATED.read_text(encoding='utf-8') if GENERATED.exists() else ''
  baseline=('/** Byte-verified approved composition: neutral data-only QA layer.\n'
    ' * NEVER promote the derived image as final visual art or bundled production asset.\n'
    ' * Only SHA-confirmed original + technical candidate pack may populate this slot.\n'
    ' */\n'
    'import type {ImageSourcePropType} from "react-native";\n'
    'export const F1_MY_FOREST_CANONICAL_DYNAMIC_QA_SOURCE_SHA =\n'
    f'  "{ARCHIVE_SHA}";\n'
    'export const F1_MY_FOREST_CANONICAL_DYNAMIC_QA_IMAGE: ImageSourcePropType|null=null;\n')
  if before not in (baseline,desired()):raise ValueError('LOCAL_GENERATED_QA_SOURCE_DIRTY_DO_NOT_OVERWRITE')
  print(json.dumps({'status':'CANONICAL_DYNAMIC_QA_VERIFIED','source_sha256':SOURCE_SHA,
    'neutral_sha256':NEUTRAL_SHA,'archive_sha256':ARCHIVE_SHA,
    'dry_run':not args.apply,'candidate_only':True,'runtime_unchanged':True}))
  if not args.apply:return 0
  DEST.parent.mkdir(parents=True,exist_ok=True)
  if not DEST.exists():
    with DEST.open('xb') as out:out.write(docs[NEUTRAL_NAME])
  if sha(DEST.read_bytes())!=NEUTRAL_SHA:raise ValueError('QA_COPY_HASH_CHANGED')
  if before!=desired():GENERATED.write_text(desired(),encoding='utf-8')
  print('QA slot ready. Explicit DEV opt-in only: EXPO_PUBLIC_MY_FOREST_CANONICAL_DYNAMIC_QA=1')
  return 0
if __name__=='__main__':
  try:sys.exit(main())
  except (OSError,ValueError,ImportError,zipfile.BadZipFile) as e:
    print('DYNAMIC_QA_IMPORT_BLOCKED: '+str(e),file=sys.stderr)
    sys.exit(2)