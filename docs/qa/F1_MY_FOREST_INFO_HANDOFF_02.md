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


## 2026-10-24｜中央收到 V2 ZIP 真實原件並完成獨立驗證

先前檔案暫不可取得的備註，**已由這次使用者實際上傳 ZIP 更新**。請以本節較新的實際驗證結果為準。

檔名 `F1_MY_FOREST_INFO_REBUILD_02_APP_FORMAT_CANDIDATE_V2.zip`、完整 SHA-256 `100f42e471164131e27188575475f2571964de6db57c2c72488a65ae7d1f78ea`：**原 ZIP bytes 在中央容器中實測完全吻合**。17／17 內部檔案，ZIP CRC 實測 PASS，12／12 PNG 完整 decode PASS，12 張圖片內容 SHA-256 全部與 `SHA-256.txt`、`manifest.json`、`placement.json` 的雜湊記載相符。

但「APP_FORMAT_QA 全部 PASSED」不能沿用，因為有下列已獨立證實的問題：
- `f1_forest_clearing_base_dim.png` 實際是 **RGB** 而非 RGBA；Manifest 與 Placement 都填 RGBA。其餘 11 張是 RGBA。這是格式一致性問題，**不是 PNG 解碼損壞**。
- `APP_FORMAT_QA.json` 的 `checks.zip_crc` 還寫 `PENDING`，雖然本次壓縮檔 CRC 確實驗證通過；必須同步修正回報文件。
- `f1_my_forest_static_character_info_group.png` 為 **1024×1536**，不同於資訊頁背景的 941×1672；`placement.json` 只是另一份資產目錄，**沒有**固定組的座標、縮放、pivot、anchor／層級與熱區映射。若按 `cover` 強行滿版，左右約各裁 87px，右木牌邊緣可能被截斷。
- 固定組畫面已有綠色進度條的**非零填充**，與正式帳本驅動下一株進度相衝突。ZIP 另有單獨的 `f1_my_forest_progress_fill.png`：中央已在契約及 generated 檔登記 **候選進度 fill 單一插槽**，但保持 null/不顯示，必須待美術移除烘焙填充、正式帳本接口確立才可啟用。
- 固定組包含木牌標題、敘述與數值板標籤；哪些可以作為固定文字、哪些屬於後台可更新資料，須逐欄人工審核並清理。固定組的土撥鼠外型需比對封版角色 Canon，不能僅用檔案格式判定角色通過。
- 前一 V1 候選 ZIP 的原始像素尚未在此工作環境找到，所以「重編碼後美術內容完全不變」**沒有像素級比較證據**。

**中央已產出下游修正報告**：
`F1_MY_FOREST_V2_CENTRAL_INDEPENDENT_AUDIT.md`、同名 JSON、`F1_MY_FOREST_V2_ART_REVIEW_CONTACT.png`、`F1_V2_DIM_BG_VS_APPROVED_ORIGINAL.png` 及未核准 `cover` 回組預覽；QA 分包為 `F1_MY_FOREST_V2_CENTRAL_ART_QA_HANDOFF_20261024.zip`，提供給美術工作區，不會冒充正式接入圖檔。

**獨立裁決**：ZIP_HASH/COUNT/CRC PASS，PNG_FULL_DECODE PASS，ALL_RGBA **FAIL**，MANIFEST_CONSISTENCY **FAIL**，ART_REVIEWED **NO**，READY_FOR_INTEGRATION **NO**，iPhone 仍 **NOT RUN**。PR #65 現有 9:16／9:19.5 候選佔位頁路由及五階 QA 保留，不導入原始 12 張 PNG；待美術以新版本無損修正、回組 QA 並經中央人工審核後才可另批考慮 Runtime 素材接入。
