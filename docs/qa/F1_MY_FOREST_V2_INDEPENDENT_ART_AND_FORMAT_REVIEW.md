# LOOPER｜F1-MY-FOREST-INFO-V2｜中央原檔與美術驗收報告
Date: 2026-10-24, Asia/Taipei
Batch: F1-MY-FOREST-INFO-REBUILD-02
Source: Original user-uploaded ZIP `F1_MY_FOREST_INFO_REBUILD_02_APP_FORMAT_CANDIDATE_V2.zip`
Status: **FORMAT_PARTIAL / ART_REVIEW_BLOCKED / INTEGRATION_NOT_READY**

## Independently verified
- ZIP SHA-256 **PASS**, exact bytes:
  `100f42e471164131e27188575475f2571964de6db57c2c72488a65ae7d1f78ea`.
- ZIP contains exactly **17 files**, all member CRC checks **PASS**.
- **12 PNG files** all fully decoded using Pillow (verify + load); `SHA-256.txt` hashes match all 12 PNG bytes, and both `manifest.json` and `placement.json` have correct image hashes and dimensions.
- Original dimmed Forest scene is **941×1672**, structure and camera composition visually correspond to the approved original `陽光瀑布森林秘境.png` (same waterfall, creek, tree/stump and background landmarks). Pixel identity to an earlier *candidate V1* cannot be demonstrated because the previous V1 candidate bytes are not available.
- Stage 01 has one default PNG. Stage 02–05 have one Bright and one Dim file each (4 pairs). Pixel averages of Bright versions are consistently lighter than matching Dim images. This is format/data QA, not final visual approval.

## Independently verified BLOCKERS
1. **False all-RGBA claim**: `f1_forest_clearing_base_dim.png` is **RGB**, not RGBA. Both `manifest.json` and `placement.json` declare RGBA. The PNG itself is valid and decodes, but the required all-RGBA contract is not met. Other 11 PNGs are RGBA.
2. **Unreconciled CRC metadata**: independent ZIP CRC passed; however `APP_FORMAT_QA.json` says `checks.zip_crc: "PENDING"`, although sender-reported QA says CRC OK. Update this metadata to match the actual validated output.
3. **Fixed image bakes live progress**: `f1_my_forest_static_character_info_group.png` already shows a nonzero green portion in the Next Plant Progress track, despite stage progress being backend-owned and not known before ledger connection. There is a separate `f1_my_forest_progress_fill.png` candidate. Art must clear the fixed filled amount so live progress can be rendered separately from authoritative ledger data.
4. **Baked text versus dynamic data**: the fixed group includes signage/title/caption and metric labels. My Forest wood-sign title may qualify as fixed art, but any caption, stage label, lower-description copy, dynamic status, number or progress value MUST be reconciled with the dynamic UI text layers and cleaned where necessary. No dynamic numbers may be painted into final fixed pixels.
5. **Geometry contract missing**: dim background is `941×1672` but fixed group is `1024×1536`. Current `placement.json` is an asset catalogue without coordinate transform, pivot, anchor or hit regions. Naively placing the group `cover` on the dim Forest would scale it to approximately `1115×1672` and crop `87px` left and right, clipping part of the right-hand wood sign. This is **not** a permissible final screen assembly.
6. **Marmot character Authority**: fixed-group marmot must be visually checked against Character Canon V2; mere valid RGBA encoding does not authorize character redesign or a new body/silhouette.
7. **Image repair provenance**: without the V1 candidate original to pixel-compare, the claim "re-encoded PNG visuals are unchanged" is unproven, although structural V2 PNG checks pass.

## Central decisions
- `APP_FORMAT_QA: PARTIAL`. ZIP CRC, count, PNG decode and image hashes PASS; all-RGBA and internal metadata consistency FAIL.
- `VISUAL_STATUS: CANDIDATE`; `ART_REVIEWED: NO`; `READY_FOR_INTEGRATION: NO`.
- `F1_MY_FOREST_RUNTIME_ART_APPROVED` remains false and `f1-my-forest-info-art.generated.ts` remains all null. **Do NOT add V2 binary PNGs to runtime or open a production deployment on this evidence**.
- Keep PR #65's already verified `sprout-hotspot → My Forest overlay → return SAME_FOREST_INSTANCE` flow, single fixed-group asset identity, Stage 01 default / Stage 02–05 ledger-controlled Bright/Dim exclusive states, null resource fields and QA-isolated controls. Formal stage thresholds/ledger are not modified.
- Keep PR #65 Draft based on PR #64 Draft. iPhone human acceptance and native full QA remain independent.

## Required V3 correction handoff to Visual / Asset Engineering
1. Convert the dim background to RGBA without changing its 941×1672 scenery or camera; update hashes, metadata and NEW version ZIP SHA.
2. Clear fixed green progress fill and any text/copy deemed dynamic. Keep final fixed-group composition as one immutable asset, rather than breaking marmot, stump, sign or decorations into movable parts.
3. Provide verified placement for fixed group on the approved 941×1672 Forest visual state, including scale, anchor, pivot, grouping and safe-area assumptions; do not stretch art.
4. Correct `APP_FORMAT_QA.json` (including actual CRC result) and cross-check both manifests against decoded pixels. Supply a side-by-side whole-screen preview for 9:16 and 9:19.5.
5. Audit marmot against sealed Canon, 9 milestone states, static typography and dynamic-field masks. Only after Central `ART_REVIEWED` approval should guarded runtime integration be scheduled.

Independent QA files are available from the Central chat as `F1_MY_FOREST_V2_CENTRAL_INDEPENDENT_AUDIT.json`, `F1_MY_FOREST_V2_CENTRAL_INDEPENDENT_AUDIT.md`, contact sheet and unapproved reassembly previews; candidate original ZIP stays unchanged.
