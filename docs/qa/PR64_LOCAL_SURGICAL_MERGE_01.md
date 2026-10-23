# LOOPER｜PR64-LOCAL-SURGICAL-MERGE-01
日期：2026-10-24（Asia/Taipei）
中央：🎛️ Looper App｜中央主控 03
目的：在保護 Windows 本機未提交成果的情況下，把 PR #64 的 F1 比例／定位／HUD QA render 接線逐檔移植到現有程式。
狀態：操作規格；**不是已完成本機 merge 的證據**。

## 重要來源
- Windows 工作區：`D:\Looper-INTEGRATION01`
- Codex 本機整合 HEAD（由上游回報）：`c1c3fd4926f7ddb00c31e6410427bab88176d1ef`。使用前先重新取得實際 HEAD；不要假定本機仍停在此 SHA。
- 唯一現行背景：`apps/mobile/assets/scene_forest_clearing_base.png`
- 正式背景 Asset ID：`scene_forest_clearing_base`
- 固定背景 SHA-256：`32021bd41d33f1b54197c3c171648f2ff0de696eb79c5b38d5a0ba8a0072f2d5`
- QA HUD 已由本機 SHA 驗證：`1f7a554640cd6137fde7d45193f6960d41f3a931b6ce85684364bf7a403a5ea1`；**現存 PNG 與 `f1-qa-hud-art.generated.ts` 原引用不能重置為 null**。
- 來源 PR：`https://github.com/joinLooper/looper/pull/64`，遠端 branch `codex/f1-iphone-visual-alignment-01`，最後核對遠端 SHA：`e64d24b04ba8e275f35aeeb8642751f7bb8cc65c`（若遠端後來更新，先重讀 diff）。

## Step 0：零破壞保全
1. 進入本機 repository，記錄 `git rev-parse HEAD`、`git status --porcelain=v1 -uall`、`git branch --show-current`，列出所有 modified / staged / untracked 路徑。
2. 建立**repo 外部**的時間戳備份資料夾，保留 `git diff --binary`、`git diff --cached --binary`、`git status`、HEAD；額外複製每個 modified / untracked 的實際原檔（包含 PNG 原檔與 generated source），絕不能只依賴 Git diff 來備份 untracked。
3. 驗證備份檔案數與 SHA-256，至少備份：`forest.tsx`、本機 `f1-qa-hud-art.generated.ts`、`scene_forest_clearing_base.png`、HUD candidate PNG，以及其餘所有本機 dirty 檔案。
4. 只在備份成功、所有檔案仍能讀取時繼續。**不得 `git reset --hard`、`git restore .`、`git clean -fd`、`git stash pop`、`git merge`、`git rebase`、`git checkout <PR branch>` 覆蓋現有工作樹。**

## Step 1：在隔離目錄檢視遠端 PR
1. 只做 `git fetch origin codex/f1-iphone-visual-alignment-01`（不切換目前分支）。
2. 可在 repo 外建立 detached Git worktree 作為**唯讀來源**；或用 `git show FETCH_HEAD:<path>` 檢視單一來源檔，原工作樹不可覆寫。
3. 將 PR #64 的七個路徑分三類：
   - 新來源：`src/f1-scene-projection.ts`、`src/f1-qa-hud-preview.tsx`、`scripts/f1-enable-qa-hud.mjs`、`tests/f1-iphone-alignment.test.ts`、`docs/qa/F1_IPHONE_VISUAL_ALIGNMENT_01.md`；僅在本機路徑不存在時新增，存在則比對後逐段合入。
   - **保留本機**：`src/f1-qa-hud-art.generated.ts`，應維持非 null 的真實、SHA 核准 QA asset import；不要以 PR 中預設 null 取代。
   - **逐段合併**：`app/forest.tsx`。這是已有本機正式背景與獨立修改的關鍵檔案，不得整檔取代。

## Step 2：只移植 forest.tsx 的必要部分
在本機實際程式先讀取附近上下文，逐項核對和修改；若與現有程式衝突，只形成差異報告，不猜測。
- Imports：加入 `f1ViewportFrame`、`f1InsetImageFrame`、`F1QaHudPreview`、`QA_F1_TWO_ROW_HUD_ART`；移除**實際已無使用的**舊座標 helper 引用。
- Background：**原封保留** `scene_forest_clearing_base.png` 的現有 import/require、`resizeMode="cover"`、已核對 hash；不得恢復 `forest-clearing.png` 測試底圖。
- 畫面：與背景同一個全幅 viewport 採用 941×1672 `cover` 縮放與置中偏移，讓圖與熱區共用尺度；safe area 留給 HUD／互動文字，不以第二套座標縮整個物件畫布。
- 原物件：知識書、任務木牌、布袋、吊牌、原生嫩芽及角色/樹屋插槽的位置應取自同一個 `f1-scene-projection` 候選框。保留核准 PNG 原件、所有原 testID/onPress/返回邏輯。若本機物件採其他最新正式位置，先比對，不以 PR 候選值蓋掉。
- 重影：如森林淨底已畫入樹樁，不得再繪第二個 stump PNG；只移除重複的裝飾，不移除知識入口熱區。
- HUD：新增兩行 QA 外殼 Preview 並**引用本機已驗證的非 null 圖**；正規玩家介面仍標示測試/候選。避免圖片變形與文字疊出外框。若候選外框與核准 V-F1 視覺有差異，只能保持 QA 狀態，待中央美術核准。
- Lv1/2：不得顯示 ⚡。Lv3+ 當前資源用測試 fixture 顯示；不修改正式 EXP/CO₂e/星星資料。
- 保留原生嫩芽 `forest_native_sprout`、資訊頁 Stage01–05 的區隔，及 Lv1/3/5/10 QA Gate；絕不可將 main-scene 候選當 info-page 圖。
- PR 提供的 `f1ViewportFrame` 在畫面邊緣會校正物件位置；必須用實際 iPhone 確認校正後沒有把物件推離背景固定接觸點。必要時將**美術物件**保留在 cover 真實投影，僅調整透明觸控區；不改核准素材比例。

## Step 3：逐段檢查與回歸測試
1. 對比合併前後本機 `forest.tsx` 的 diff：除已核准的視覺/座標/QA HUD 動態顯示區域，不得刪改背景 import、事件路由、資料隔離、其他本機修正。
2. `pnpm --filter @looper/mobile typecheck`。
3. `pnpm --filter @looper/mobile test`。上游回報本機 **27/28**；要求精確列出 FAIL 的 test name、stack、最早錯誤，修正原因並重跑；不可將 Puppeteer ignored-build policy 自動歸類為程式成功，也不能為通過而關閉測試。
4. 9:16 和 9:19.5 Web 截圖：Lv1 Forest、完整 HUD、知識書、任務木牌、布袋、吊牌、中央嫩芽，點擊及返回；正規 QA 入口與正式 build 隱藏檢查。
5. Native 和 iPhone Expo Go **分開驗收**。真人 iPhone 需重啟/重新掃描正確版本 QR，回報 Metro 實際載入 HEAD，與 Git 本機 HEAD 對上；取得兩比例/可用機型的實際畫面、物件點擊/返回證據。
6. 若 Native UI 找不到 `enter-forest`，必須交付實際 Native log 與 screenshot，不能以 Web PASS 代替。

## 最終回報格式
- 備份路徑與原始 HEAD、dirty-file 清單；
- PR #64 每個檔案：新增/沿用/逐段合併/跳過，以及理由；
- 合併後 Git HEAD 或 dirty diff/patch 路徑（**未提交也要如實說明**）；
- Forest 底圖及 QA HUD 實際 bytes/SHA-256；
- TypeScript、Mobile 28項、Web 9:16/9:19.5、Android Native、iPhone 的各別狀態；
- iPhone 仍然需要修正的像素級對照、缺件與未解決項目。

## 禁止事項
禁止 hard reset、覆蓋/刪除未提交檔、整個 apps/mobile diff 套用、擅自 stash pop、合併/部署正式版、對正式帳本寫入、重新生成美術或將候選升格 Final。


## 2026-10-24 更新｜本機安全前置已 PASS；Provenance 27/28 明確原因

已從 Windows Codex 回報確認：
- 原 HEAD：`c1c3fd4926f7ddb00c31e6410427bab88176d1ef`。
- 已建立專案外備份：`D:\\Looper-INTEGRATION01.runtime\\pr64-surgical-backup-20261024-002530`，含 dirty/untracked、Forest 背景、HUD；未做 hard reset/rebase/merge。
- 遠端 PR SHA 當時 `33b136979a3834a6e32d64cf4a46d3a90d7a304b`；**此後 PR 已有新提交，開始逐檔前應重新 fetch 並記錄新 SHA**。
- 本機 QA HUD 實際 `qa-hud-two-rows-candidate.png` 已通過雜湊；當時 27/28 精確 FAIL 名稱 `all packaged art is existing non-character source with provenance`，原因是新候選檔未進入資產來源授權清單，而不是遊戲 Runtime 失敗。
- Repo root 引起的相對路徑錯誤不同於上述 Provenance 失敗；測試請在 `apps/mobile` 的工作目錄下執行或用會正確設定 cwd 的 pnpm --filter 指令。

### 僅針對 Provenance 的來源修正（已提交 PR #64）
1. `apps/mobile/assets/PROVENANCE.json` 的 `assets` 陣列現在明確登錄 `f1/qa-hud-two-rows-candidate.png`，來源 `LOOPER_F1_IPHONE_HUD_QA_HANDOFF_20261023.zip`，SHA-256 `1f7a554640cd6137fde7d45193f6960d41f3a931b6ce85684364bf7a403a5ea1`，狀態 `ART_CANDIDATE`，用途 `EXPO_QA_ONLY`；**絕不表示美術 Final**。
2. `apps/mobile/tests/shell.test.ts` 保留原來三張 root PNG 白名單及 `noPrivateCharacterOriginals`／`noNewCharacterArt` 檢查；增加候選資料存在、候選屬性及若原件實際存在時的 SHA 驗證。沒有停用或放寬核心測試。
3. Windows 本機的 `PROVENANCE.json`、`shell.test.ts` 如已有未提交修改，**一樣必須逐段比對與融合**，不能用 PR 全檔蓋掉。已完成的本機 HUD `generated.ts` 非 null 引用維持不變。
4. 在 `apps/mobile` 工作目錄先單獨執行 provenance test，再執行 28 項原測試及新引入的 PR64 alignment tests。**總測試數可能增加，應報實際項數與通過數，不硬寫 28/28。**

### 首次實作目標與分段提交
- **Gate P（素材來源）**：比對新增 Provenance entry 與本機 HUD PNG SHA，修復 27/28；若仍 FAIL，回報最早 stack 而非略過。
- **Gate A（只新增來源模組）**：在不更動本機 `forest.tsx` 的前提下檢查與新增 f1-scene-projection、f1-qa-hud-preview、相關 tests；保留 HUD 非 null import。
- **Gate R（關鍵 Render 接線）**：按「Imports → 全幅座標 → B07/植株熱區 → HUD → Lv1 ⚡」五個小區塊，各區塊只修改當前 `forest.tsx` 所需幾行並檢查 diff。不准任一步整檔替換。
- **Gate Q（視覺）**：每完成一區塊可跑 typecheck，全部區塊完成再跑手機 9:16、9:19.5；iPhone 人工確認物件真正與背景固定接觸點一致。
- **Gate N（原生）**：單獨調查 Android Native 的 `enter-forest` 找不到問題與 iPhone Metro 版本，不能由 Web PASS 推論。

所有步驟先在備份存在且雜湊核對一致的前提下執行，遇到已有不同內容的本機檔案，以原檔保存及小段手工差異整合為優先。
