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


## 2026-10-24｜APP_FORMAT_CANDIDATE_V2 重新封裝交接

上游交接工作區另行回報新的 V2 ZIP，**不是原先 V1 ZIP，也不能以 V1 的 hash 代表 V2**：

| 項目 | 工作區交接回報 | 中央目前可自行驗證的狀態 |
| --- | --- | --- |
| ZIP | `F1_MY_FOREST_INFO_REBUILD_02_APP_FORMAT_CANDIDATE_V2.zip` | 本聊天室沒有實際上傳 bytes，Project/Library/容器均未找到 |
| ZIP SHA-256 | `100f42e471164131e27188575475f2571964de6db57c2c72488a65ae7d1f78ea` | 已登錄預期值，**無原檔可重算** |
| ZIP 檔案數 | 17 | Sender-reported, unverified centrally |
| ZIP CRC | OK | Sender-reported, unverified centrally |
| PNG | 全數可解碼、統一 RGBA；Stage02–05 Bright/Dim 重編碼 | Sender-reported, unverified centrally |
| Manifest | `placement.json`, `state_manifest.json`, `manifest.json`, `SHA-256.txt` 更新 | 尚未檢閱 V2 內容 |
| APP_FORMAT_QA | PASSED | 上游聲明 PASS，非中央重新實測 PASS |
| VISUAL_STATUS | CANDIDATE | **維持** |
| ART_REVIEWED | NO | **維持** |
| READY_FOR_INTEGRATION | NO | **維持** |

### V2 檔案收到後的零破壞驗證

已在本 PR 提供另一支只讀稽核工具 `apps/mobile/scripts/audit-f1-my-forest-info-v2.py`。
此腳本**不**解壓寫入 `apps/mobile/assets`，不產生 Metro require，不改動 `forest.tsx` 或帳本，也不升格候選為 Final。需要 Python 環境中已有 Pillow 才能做完整像素 decode；若缺少則 fail closed，不安裝任何套件。

在 Windows 取得真實 ZIP 後：

```powershell
cd D:\Looper-INTEGRATION01
py -3 .\apps\mobile\scripts\audit-f1-my-forest-info-v2.py "C:\完整路徑\F1_MY_FOREST_INFO_REBUILD_02_APP_FORMAT_CANDIDATE_V2.zip"
```

通過項目：完整 ZIP SHA-256、17 檔、CRC、危險路徑/重複檔名、九張 Stage PNG + dim 背景、至少一張固定組/參照圖、所有 PNG 完整解碼為 RGBA、dim 941×1672、三份 JSON 可解析、`SHA-256.txt` 包含必要 PNG 雜湊。原圖是否含殘留數字／文字、固定組圖像是否具正確 Asset ID 映射，以及「V2 像素內容與 V1 美術完全不變」**不能只靠格式檢查證明**，保留人工驗收和來源像素 hash 比對需求。

不論腳本輸出 `APP_FORMAT_QA_INDEPENDENTLY_PASSED__VISUAL_CANDIDATE_ONLY` 與否，`F1_MY_FOREST_RUNTIME_ART_APPROVED` 仍維持 `false`，背景/固定組/Stage art 的 `generated.ts` 全為 `null`，主畫面原有 Forest 實例與入口不變。

接下來須依序通過：真實 ZIP 交付 → 獨立 byte/PNG QA → 人工檢查整頁構圖與動態字數殘留 → 中央 `ART_REVIEWED` → 驗證 Asset ID 和遮罩／placement → 才能在獨立批次執行真正 Sprite Runtime integration。本批仍禁止合併 Draft PR 或正式部署。
