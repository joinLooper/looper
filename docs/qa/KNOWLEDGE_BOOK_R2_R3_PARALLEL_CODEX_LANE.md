# LOOPER｜Knowledge Book R2＋R3｜獨立 Codex 工作線 B

> Status: **VISUAL_REVISION_REQUIRED** (functional QA may be retained). R2/R3 art integration and iPhone visual NOT PASS.


<!-- CENTRAL_VISUAL_RESET_20261025 -->
## 🚫 2026-10-25 中央視覺退修：小書必須在原 Forest 上展開

**優先於下方舊版 QA checkpoint。狀態：FUNCTION_QA_RETAIN / VISUAL_REVISION_REQUIRED / NOT_ART_READY。**

創辦人最新明確要求：**「小書打開後，背景一樣是主畫面變暗的背景」**。B 目前以 `KnowledgeBookQa.tsx` 製作的 `SafeAreaView backgroundColor="#e9eee4"`、獨立頂欄、卡片清單與米白色整頁表單，**不是核准的遊戲畫面**。B 之前通過的 19 項新增測試及雙比例 Web 功能測試可保留，但視覺 QA 必須撤銷，不能宣稱畫面已整合 R2/R3。

**參考圖明確身分**：使用者重新提供的是 **1500×1250 R3 視覺缺件檢查展示板**（Library `/Looper/VisualReview/KnowledgeBook/KNOWLEDGE_BOOK_R3_REVIEW_BOARD_USER_REFERENCE_20261025.png`，SHA-256 `29b90e16b74de2d4e6d4da4f91e8ab959b7b4cbf3d437442838b08b199f37618`）；它右側的局部插畫與下方五張紙卡是**單獨素材樣本**，米白背景只是**評審展示板**，**絕對不是 App 背景**。只將上方展開的綠邊雙頁小書、左頁題目／插畫／解析、右頁四張選項紙卡及翻頁、返回／下一題的圖像關係當作書本視覺標準。

### 必須完成的唯一正確畫面結構

1. **同一個現有 Forest 主場景持續顯示於底層**（包含原本 HUD、樹樁、道具、角色／可見等級狀態），不能切換到另一張純色背景，也不能在開書時破壞／重設 Forest State。
2. 在整張 Forest 上方加**滿版深色半透明遮罩**，包含 HUD；再於畫面中央前景顯示 **R2 書本母件為基礎、R3 修正為視覺參考的綠邊展開小書**。書頁、書脊、紙質選項、圖示需保留原美術外型；不能替代為全螢幕直向卡片表單、標準 Dashboard、白底浮窗或只用森林書本入口小圖放大。
3. 題目、選項、答案、解說、Knowledge、⚡、作答次數和 Next/Back 均由**系統繪製於書頁既定欄位**，不是畫在 R2/R3 PNG 裡。五種紙卡 `default/selected/correct/wrong/completed` 以來源候選素材與 hitbox 對位。
4. **橫向開書造型必須能看出兩頁與中間書脊**。手機 9:16／9:19.5 如出現文字太小，可調整書本等比縮放、書頁內捲動／頁內閱讀，但不允許把書頁重排為直向一列一列卡片來解決。
5. 關書應**只移除小書和暗色遮罩，回到原本同一個 Forest 實例**；題目切換與答題狀態不要跳到獨立全白/米色路由。中央正式接入口仍屬 A 的 `app/forest.tsx`：B **不得直接修改**。B 可在自有 QA route 透過**唯讀重用現有 Forest 視圖**，展示同一個場景後方實際變暗；同時輸出可插入 Forest 的 `KnowledgeBookOverlay` 元件以及一次性的 `INTEGRATION_HOOK_REQUEST`，待 A 鎖定入口後中央串接。
6. QA 測試 Lv1／Lv3 的 debug 面板不許佔據玩家看到的打開書本畫面；DEV 控制應隱藏／可收合。前兩題免費、第三題 `ENERGY_POLICY_PENDING`，無正式帳本／EXP／星星／⚡寫入，也不擅自定成本與上限。
7. 保留 B 線所有已通過狀態機、路由與無寫入測試；改正**視覺外殼**而不是重做答題制度。R2/R3 候選素材不得升格 Final，缺未壓平書本母檔 `ART_BLOCKED`，不能以假分層冒充。

**解決 B 線「原始素材找不到」**：已將原始位元組未更動的 R2＋R3 合併 ZIP、最新展示板 PNG、來源 SHA、工程收尾要求放到**單一 Library 交接包**：
`/Looper/Engineering/LOOPER_KNOWLEDGE_BOOK_B_VISUAL_RESET_20261025.zip`（Library ID `libfile_270e8975a554819197c60f5ef902f451`，整包 SHA `7165c6136f8efc3c4759076a3e860a48b412ca0bc0ee8b3a0f3034ca60c62286`）。原 R2+R3 combined SHA `21636c0a0115ecb1107b7817aafa30e013b17c6341bc1dded51b02c623a60d72`。若 Windows Codex 無法自動存取 Library，明確請下載交接包到 B 工作樹的本機非 Git 追蹤資料夾，再核 SHA；**不可因下載失敗而沿用假書本 UI 冒充視覺通過**。

### 修改後驗收 Gate（B 必須實際提供）

- 9:16 與 9:19.5 的**真正 Expo Web／App 執行截圖**，能同時看見**Forest 原畫面 → 全畫面暗色遮罩 → 綠邊雙頁開書**。
- 逐一拍下未作答、選取、答對、答錯、解說和下一題的畫面；答案區不離開書本。
- 實際點書本內 Next／Return、關閉 X 後同一 Forest 畫面與互動仍存在。嚴格檢查兩比例安全區／hitbox／字體可讀。
- 保留 19 項功能 QA 的既有結果，另列 R2/R3 真素材接入狀態、圖片 SHA、未壓平母檔阻擋和 iPhone 真人驗收未完成。
- 沒有滿足「真 Forest 暗底＋開書前景」，就只能報 `VISUAL_REVISION_REQUIRED`，不可報 Visual Approved／Asset Ready／Runtime Integrated／iPhone Visual QA Passed。

---


## Authority and handoff

- Canonical task: [Issue #67](https://github.com/joinLooper/looper/issues/67).
- Initial B base: `codex/f1-my-forest-info-handoff-02`, exact commit `9c1da86c84af777d2a346215faf2a76bdbbd2b59` (same common PR #65 base as A).
- Branch B: `codex/knowledge-book-r2-r3-qa-isolated-01`.
- Independent A: [PR #66](https://github.com/joinLooper/looper/pull/66), `codex/app-art-integration-reform-01`. **B must not base on A, merge A, cherry-pick A, or write to A's branch**.
- Source archive R2/R3 `LOOPER_KNOWLEDGE_BOOK_R2_R3_COMBINED_REVIEW.zip`, SHA-256 `21636c0a0115ecb1107b7817aafa30e013b17c6341bc1dded51b02c623a60d72`.
- Library engineer handoff: `/Looper/Engineering/LOOPER_KNOWLEDGE_BOOK_R2_R3_APP_QA_HANDOFF_V1.zip`, Library `libfile_4df0975cb8b88191b47d5d4b075ccbfc`.
- R2 source is the book engineering foundation; R3 is review/5 paper-card states/food-waste illustration verification. Keep both source packages and SHAs separately.
- Missing genuine non-flattened book master: `ART_BLOCKED`. Never fabricate layers, art approval or final art.

## Strict file ownership (do not override A's parallel work)

B may CREATE/EDIT only:
- `apps/mobile/src/knowledge-book/**` (pure view/state/QA wrapper components with isolated exports)
- `apps/mobile/tests/knowledge-book-*.test.ts`
- `apps/mobile/scripts/knowledge-book-*.{mjs,py}`
- `apps/mobile/app/knowledge-book-qa.tsx` (unique **DEV/QA only** route, not the existing Forest `knowledge` route)
- `docs/qa/KNOWLEDGE_BOOK_R2_R3_PARALLEL_CODEX_LANE.md` (this checkpoint)
- `docs/qa/KNOWLEDGE_BOOK_R2_R3_QA_EVIDENCE.md` (only if actual checks and screenshots exist)

B MUST NOT EDIT in parallel:
- `apps/mobile/app/forest.tsx`, `apps/mobile/app/knowledge.tsx`, `apps/mobile/app/_layout.tsx`
- `apps/mobile/src/forest-ui.tsx`, `apps/mobile/src/model.ts`, `apps/mobile/src/state.tsx`
- `apps/mobile/package.json`, root `package.json`, lockfiles, shared types, shared QA scripts, `.github/workflows/**`
- `apps/api/**`, `packages/**`, `docs/authority/APP_ART_INTEGRATION_REFORM_01.md`, any `f1-my-forest-*` files
- all original Forest/HUD assets, any approved visual source files, and player ledgers

If a shared-file change becomes essential, STOP that specific change only: record `INTEGRATION_HOOK_REQUEST` with an exact proposed patch and expected test IDs in Issue #67. Do not make the edit. Central will authorize a one-time serialized integration **after** A freezes its corresponding entrypoint. The rest of B continues in isolated files.

## Engineering implementation target

1. Standalone DEV-only QA route/component: book intro → question → unanswered → option selection → correct/wrong → explanation → next question → close/back. Test tap behavior and return without touching Forest entrypoint.
2. Paper-card states in order `unanswered / selected / correct / incorrect / completed`; question, answer, explanation, Knowledge text, ⚡ indicator and counts are SYSTEM text, not baked PNG fields.
3. Daily questions 1–2 free; question 3 enters `ENERGY_POLICY_PENDING`. No guessed deduction/max quota and NO economy writes. Existing single-card `POST /player/knowledge-cards/:cardId/answers` is not the new multi-question policy; never call it in QA. Existing Lv3 knowledge entitlement remains unchanged.
4. R2+R3 source verification and `placement.json`, `state_manifest.json`, `hitbox.json`; preserve source bytes, store generated QA images locally only, not in public repo.
5. Run typecheck and tests with existing commands **without modifying package scripts**. Render **real runnable Expo Web** at both 9:16 and 9:19.5 if possible; composite reference pictures alone are not executable evidence. Mark each independent status correctly.

## Two independently isolated Windows Codex directories (example)

For A, **do not move or clean the existing dirty working folder**. For B, from a clean copy of the repository:

```powershell
git fetch origin
git worktree add ..\looper-knowledge-r2r3 codex/knowledge-book-r2-r3-qa-isolated-01
```

Only if Git refuses due to a checked-out branch, use `git worktree add -b codex/knowledge-book-r2-r3-local ..\looper-knowledge-r2r3 origin/codex/knowledge-book-r2-r3-qa-isolated-01` and push to the proper B branch via reviewed commits. Never `git reset --hard`, `git clean -fd`, `git stash pop` into an unrelated worktree, or force-push A. Do not start two agents on one worktree.

## Deliverable and merge gate

- B Draft PR targets `codex/f1-my-forest-info-handoff-02`, **not** A's branch or `main`. No auto-merge.
- Provide actual commits, changed-file whitelist check, tests, 9:16/9:19.5 screenshots, SHA proof and precise missing-art/policy blockers.
- Separately hand Central a minimal `INTEGRATION_HOOK_REQUEST` for Forest book open/close. Central schedules one tiny shared-file patch after A locks the entrypoint; no other shared-file changes.
- Both lines remain Draft; no production deployment, approved-art promotion or formal player-ledger changes.

## 2026-10-25 Windows B checkpoint

- Independent local worktree and branch established at B commit 623e17a74c96d527cab8539d0c98876e8895bd84. No A commits, shared Forest edits or package/lockfile changes.
- Isolated playable route /knowledge-book-qa, all five paper states, dynamic question data, same-day QA idempotency, Lv1/Lv3 fixtures and third-question policy stop implemented. No network/economy/persistent ledger dependency.
- Typecheck PASS; B tests 14/14 and importer safety 5/5 PASS; complete mobile suite 66 PASS / 0 FAIL / 1 pre-existing Python-launcher SKIP, with the equivalent AST check separately PASS.
- Real Expo Web 9:16 and 9:19.5 interactions PASS, 20 local screenshots, 17 measured taps per ratio, no page errors/asset failures/player API requests. The same-drive build mirror SHA-verifies 58 copied source/asset files; it does not change A's source or dependency files.
- Source ZIP bytes/actual R2-R3 art remain unavailable; ART_BLOCKED_NATIVE_BOOK_LAYERS_MISSING and ENERGY_POLICY_PENDING remain. No Final/Asset Ready/formal runtime/iPhone promotion.
- Actual evidence, source/bundle fingerprints, local screenshot locations and the exact un-applied INTEGRATION_HOOK_REQUEST are in [B QA evidence](KNOWLEDGE_BOOK_R2_R3_QA_EVIDENCE.md). Central alone connects the shared Forest hotspot after A freezes it.