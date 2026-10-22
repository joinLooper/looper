# APP-EVENT-FLOW-01｜四級 iPhone QA × 全事件導覽整合紀錄

日期：2026-10-22（Asia/Taipei）
分支：`codex/app-event-flow-01-iphone-gate`
上游：Draft PR #61（`codex/app-event-flow-01-authority`）
整合審查：Draft PR #62

## 原始基線與追溯
- 使用者交付：`Looper_Forest_Level_QA_IPHONE_CONFIRMED_bfc402b.zip`。
- 本機交付的 Final HEAD：`bfc402bae3d6b77608a35fe41f1f2e6eb97783c1`，原上游 `d2e8f0ef433768f2a18ff3ede82ad92713801aff`。
- 該 SHA 未在 GitHub 遠端確認，因此此分支是以 ZIP 中的來源／邏輯**重建等級 Gate**，而非直接 cherry-pick 原 Git commit。不能宣稱兩份 commit 完全一致。
- 舊 W2-05 視覺中央退回裁決維持，核准 B07 PNG 與角色素材原檔均未修改。
- 原 iPhone「四級選級與返回正常」是使用者於 2026-10-20 的操作回報；本分支未重新取得新的 iPhone 實機證據。

## 本批整合內容
1. 保留 PR #61 匯入的 186 路徑列、151 制度事件及 807 畫面轉換之唯讀 QA 資料。
2. 恢復歡迎頁 QA 選級（Lv1／Lv3／Lv5／Lv10）、QA test fixture、狀態重設、Level HUD、限制 Lv1 知識進入。
3. 恢復森林「更多 → 返回 QA 選級」，原有可操作物件不取代正式素材。
4. 從等級 Gate 直接開啟事件導覽，從森林「更多」進入／返回事件導覽。
5. 事件資料只有預覽級別的狀態機轉換；任何成功、扣款、授予、核銷或 CO₂e 改變都**必須**由正式服務作出決定。
6. 測試：新增 `qa-levels.test.ts`，核對正式 LEVEL_DEFINITIONS／Gate 安全界線，原 `event-flow.test.ts` 仍維持。

## 未驗收與後續待辦
- 這次整合**尚未代表**每個場景道具與 151 事件都有正式可用的玩家操作；QA 瀏覽器是索引與模擬，不等於正式 Gameplay 完成。
- 29 個「僅有類別入口」事件仍需細化成具體可點擊分支。
- 4 個事件的矩陣存在無法由單一起始狀態走遍的分支，應先查核是否預期的例外入口再補正式狀態機。
- Lv5 Treehouse 尚未具備樹屋內部互動；Lv10 回憶內容與章節畫面仍需素材。
- 外部店家／優惠券／核銷／帳本不使用預置獎勵冒充正式交易。
- iPhone Expo Go 新版本仍需由使用者在 Windows 端啟動 Metro，逐級真人測試，提交影片／截圖及裝置資料。
- 不合併 PR #61/#62 到正式主線，不部署正式 App；Android 真人仍維持 DEFERRED。
- 避免本機不可逆操作：在 `D:\Looper-INTEGRATION01` 先執行 `git status` 並確認重要未推送提交存在，再抓取遠端 PR #62 供比較或安全移植，不得 hard reset。

## 驗收證據分層
- **來源索引**：151/151 事件關聯與 807/807 轉換資料已檢查；此為資料結構完整，不代表分支皆可到達。
- **單元／型別**：以 PR #62 最新 CI 報告為準，不由檔案存在自行宣告 PASS。
- **Web**：需專門驗證 QA Level Gate → Forest → QA Event Explorer → Return 的點擊流程及一般 Release 隱藏。
- **Native**：Android CI、iPhone 真人各自計算；Web 成功不能替代實機結果。
- **正式 Gameplay**：必須有真實後端 receipt/revision、資料持久化、驗收證據，才能升格。
