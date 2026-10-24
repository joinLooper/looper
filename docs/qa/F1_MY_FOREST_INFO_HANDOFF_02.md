# LOOPER｜F1-MY-FOREST-INFO-HANDOFF-02
2026-10-24｜中央主控 03 × APP 工程
Artwork: **VISUAL CANDIDATE / NOT ART_REVIEWED / BLOCKED_ART_REVIEW**
GitHub: Draft PR #65 based on Draft PR #64; no merge or production deployment.

## Source and evidence status
User supplied a path to `sandbox:/workspace/scratch/06eeafdf2d5d/F1_MY_FOREST_INFO_REBUILD_02_CANDIDATE.zip`.
This exact file is not mounted in the central session/container and was not found in the available Project/Library file results. The user-specified ZIP checksum is
`501b2697740e276d8b90e78ed698d8b39cd34e90fd4c1dd4731a365f9d073204`.
**The SHA and ZIP internal bytes have NOT been verified by the central engineer**. No candidate PNG is committed or declared `ART_REVIEWED` or `READY_FOR_INTEGRATION`.

Read-only ZIP audit script:
```
py -3 apps/mobile/scripts/audit-f1-my-forest-info-zip.py "C:\\path\\F1_MY_FOREST_INFO_REBUILD_02_CANDIDATE.zip"
```
Checks actual archive SHA-256, CRC, the nine named stage files, candidate dim background, PNG dimensions; it still returns ART CANDIDATE and demands manual review of static-group identity and whether illustrations contain leftover dynamic text/numbers. An audit passing **does not** automatically add images to Runtime.

## One and only player navigation path
Existing Forest React instance:
`sprout-hotspot` → `sheet==="sprout"` → `F1MyForestInfoOverlay`
→ shared `ForestAction` / `close-sheet` (or Native Back) → `setSheet(null)`
→ same Forest instance / same camera, main sprout Image and player state.

This replaces the previously shown PR63 `SproutInfoContents` player-facing branch.
The superseded PR63 source declarations remain untouched for backward compatibility and historical audit, but **no new candidate milestone image imports from them** and the root Forest sprout still uses its original `sprout.png`.
The new My Forest page does **not** invoke `dispatch({type:"care"})` merely for opening/viewing. It cannot grant EXP, star, energy, CO₂e or ledger milestones.

## Three separate visual responsibilities
1. `f1_forest_clearing_base_dim`: single candidate full-viewport dimmed Forest source, authored 941×1672, same waterfall, trees, mountains, creek, no regeneration or perspective shift. Uniform `cover` rather than independent width/height stretch.
2. `f1_my_forest_static_character_info_group`: one indivisible Image slot containing marmot, tree stump, my-forest sign/panel/fixed shadows/decor and bottom static board. Do not break apart, reposition or substitute individual character/prop PNGs.
3. Milestone row: exactly Stage01 default + Stage02–05 Bright/Dim art pairs = nine names in `f1-my-forest-info-contract.ts`. Each stage picks one selected Image or one clearly marked missing-art placeholder.

All images currently null in `f1-my-forest-info-art.generated.ts`.
No dim or static visual image is fabricated: page uses neutral dark placeholders only in QA.

## Resource ledger and data interface
`MyForestLedgerSnapshot` provides:
- plantedCount;
- accumulatedCarbonKg;
- nextPlantProgress currentKg/targetKg;
- stageUnlocked states for stages02–05;
- five stageNames and stageValues;
- footerDescription.

In this draft Forest passes `ledgerSnapshot={null}` explicitly.
All missing dynamic values render **—**, not `0` or sample numbers.
Stage01 mode `default`; stages02–05 become `bright` only for **formal ledger `true`**, `dim` only for `false`, `pending` for null/unconnected. The stage logic NEVER computes thresholds or derives states from Lv, EXP, taps, care, or local time.
QA mode exposes manual stage/Bright/Dim toggles in transient React local state. QA actions never dispatch demo events or write a ledger, and always reset upon reopening.

## Formal event continuity
Preserve original `OB103` and `EV-CARBON-DETAIL` references, and do not register new system events or thresholds as part of the screen redesign.

## Acceptance matrix — do not claim more than actual evidence
| Requirement | Engineering status | Art status |
|---|---|---|
| Forest sprout → only new My Forest screen | wired in Draft PR65 | QA routing only |
| Single fixed group Asset ID | typed + single Image slot | PNG missing / candidate |
| Dim background Asset ID | typed + separate Image slot, uniform cover | PNG missing / candidate |
| Stage01–05 selection | QA selector and typed asset IDs | all 9 images missing |
| Bright/Dim one state at a time | pure ledger-only resolver | no actual pixels reviewed |
| Metrics/text slots | readonly null-safe interface | embedded fixed-image text residue not yet checked |
| Close/Back same Forest instance | existing modal state, shared close control | 9:16/9:19.5 iPhone acceptance pending |
| No ledger changes/growth | no dispatch or backend calls | N/A |

Separate gates:
1. GitHub TypeScript and Mobile unit tests.
2. GitHub Web screenshots at 9:16 / 9:19.5 (remote branch still uses default test Forest background without Windows-only approved PNG; do NOT label these as final art).
3. Android Native smoke checks actual open/close.
4. Windows Expo Go real iPhone QA with exact Local HEAD+dirty-file fingerprint and approved V-F1 background.
5. Candidate ZIP actually delivered, SHA/CRC/pixel audit, image-text cleanup, formal Central `ART_REVIEWED`, guarded art import.
6. Only thereafter promote assets as ready, with separate original-asset hash and integration evidence.

**Forbidden:** shipping candidate art, making up CO₂e or stage thresholds, merging draft PRs, replacing an existing player ledger, or using the main Forest sprout sprite as an info milestone.
