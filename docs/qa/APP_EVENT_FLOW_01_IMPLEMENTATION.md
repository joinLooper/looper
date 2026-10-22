# APP-EVENT-FLOW-01｜全事件互動骨架・QA 工程接續紀錄

日期：2026-10-22（Asia/Taipei）
狀態：SOURCE REGISTRY + QA EXPLORER IMPLEMENTED; IPHONE NOT YET RE-TESTED
中央主控：Looper App｜中央主控 03

## 來源與不可破壞的版本
- 最新 iPhone 等級選單本機交付：`bfc402bae3d6b77608a35fe41f1f2e6eb97783c1`，本機分支 `codex/qa-forest-level-gate`。
- 該版本尚未推到 GitHub；目前主線上游為 `codex/w2-05-worldbook-surface`（Draft PR #60）。**不得把上游較舊程式宣告成最新測試版**。
- 本 PR 建於遠端 W2-05，用來保存可追溯的資料與獨立 QA 瀏覽器。請勿直接以本分支覆蓋本機 `bfc402b` 的檔案。
- 使用者於 2026-10-20 回報的 iPhone 四級選級／返回正常仍有效，但不等同新 QA 瀏覽器或正式功能的實機 PASS。

## 已實作的內容
- `apps/mobile/src/qa/flow-authority.generated.json`：來源列完整資訊供稽核，來源表的 186 路徑列、151 正式制度事件、5 補充列、807 畫面轉換。
- `apps/mobile/src/qa/flow-runtime.generated.json`：UI 導覽使用的精簡規格。
- `apps/mobile/src/qa/event-flow.ts`：路徑樹、事件、畫面轉換的唯讀導覽函式；不連線不發獎。
- `apps/mobile/app/qa-events.tsx`：QA 畫面，路徑進出、事件搜尋、逐步分支切換與診斷檢視。
- `apps/mobile/app/forest.tsx`：只有 QA 旗標開啟時，從「更多」選單通往事件導覽。
- `apps/mobile/tests/event-flow.test.ts`：來源關聯和唯讀模擬單元測試（尚待 Codex 執行）。
- 正式資料來源：Visual Asset Register `1pU4kQN8ZyvgXHKzJRWCdNbmDaZsgl7ZisR6ZwvYcd1M` 的「劇情畫面樹狀路徑 v002」、「事件對畫面路徑 v002」、「事件畫面轉換矩陣 v001」。

## 來源資料初步結構稽核
- 186 筆路徑（含原 182 節點以外的補充列）都能由 ROOT 追溯；沒有失效的父節點。
- 151 項制度事件都具有對應路徑，且 807 筆轉換全有對應制度事件。沒有重複事件 ID。
- 4 項事件包含不能從單一入口沿合法邊全部走到的分支：`EV-TASK-PROGRESS`、`EV-KNOW-DATE`、`EV-CODE-LIMIT`、`EV-SETTINGS`。在規格查核結束前，不得自動跳轉、虛構前置結果或視作完整 E2E PASS。
- 來源的「路徑對照精度」有直接與類別入口不同等級；對應到類別的事件仍需由 Codex 實際補齊介面入口。

## 限制與安全界線
- 這是 **QA 層的事件規格導覽與畫面狀態模擬**，不是 151 項正式功能全部實作。
- 不能把 `V-SYS-SUCCESS`、確認、交易成功等畫面模擬誤當正式 receipt；不改動正式玩家登入、EXP、⭐、⚡、CO₂e、背包、優惠券與核銷。
- 正式系統應先查回有效 receipt/revision、核對來源唯一鍵與解鎖條件，才能更新權益；逾時／未知必須保持未知，不可重發。
- 此版本的等級過濾只供 QA 檢視，不等於正式後端的授權／可操作性。
- 入口只限開發模式或 `EXPO_PUBLIC_ENABLE_QA_LEVELS=1`；發行版不得開此旗標。直接輸入深連結時亦需導回正式入口。

## 下一步：本機 Codex 交接
1. 在 Windows 本機 `D:\Looper-INTEGRATION01` 核對 `git status --porcelain`，並確認 `bfc402bae3d6b77608a35fe41f1f2e6eb97783c1` 存在。不乾淨先保存變更，不要 hard reset。
2. 從 `bfc402b` 建立新的 Codex 功能分支；遠端抓取 `codex/app-event-flow-01-authority` 的本批變更，**擇要移入新增 QA 程式檔**；其中 `forest.tsx` 需保留本機 QA 選級修補，再合入一處「更多 → QA 事件導覽」入口。
3. 現有 `qa-levels.tsx` 可加上「開啟 QA 事件路徑」按鈕；不得讓 QA 直達寫入正式狀態。自動掃描 151 個事件及路徑 ID 對應。
4. 對接森林中實際的角色、嫩芽、背包、知識、樹屋等觸控熱區，優先完成 Lv1／Lv3／Lv5／Lv10 的「點擊 → 內容 → 返回」。缺素材以 QA 按鈕代替；缺後端用明示的唯讀測試狀態，不假造正式效果。
5. 執行 `pnpm --filter @looper/mobile typecheck`、`pnpm --filter @looper/mobile test`、雙比例 Web QA、發行版 QA 入口隱藏驗證、Expo Go iPhone 真人操作；提交影片／截圖與可重現錯誤列表。
6. 工作完成前不合併主線、不部署正式版；以「事件路徑」、「後端完成」、「正式美術」、「iPhone 真人驗收」四個面向分別記錄。

## 實作定義
**完成 QA 事件導覽 ≠ 151 項正式功能可玩 ≠ 807 條轉換全部實測 ≠ iPhone 畫面 PASS。**
