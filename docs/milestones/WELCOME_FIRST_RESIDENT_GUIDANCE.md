# Welcome First Resident P0-3 — Resident Guidance

## 結論

第一位居民在 authenticated canonical resident state 完成載入後，會看到六步、可略過且可重看的居民引導。引導只使用 Player presentation state 與 resident-scoped localStorage，不新增或修改任何正式資源。

## 正式六步

| 步驟 | 標題 | 畫面脈絡 | 主要操作 |
| --- | --- | --- | --- |
| 1 | 歡迎來到 Looper | 居民首頁；安全顯示 canonical display name | 開始看看 |
| 2 | 這裡是你的家 | 居民角色與居民空間入口 | 下一步 |
| 3 | 每次行動，都會留下成長 | canonical CO₂e、種子、植物與樹木摘要 | 下一步 |
| 4 | 先從今天的小任務開始 | 今日來訪與永續小知識 | 去看看 |
| 5 | 城市生活機能正在準備 | 蔬食餐廳入口的純說明 | 知道了 |
| 6 | 開始你的居民生活 | 回到安全首頁自由探索 | 開始探索 |

## 首次狀態

- Key namespace：`looper.web.residentGuidance.v1.<canonical resident ID>`
- Value 僅包含 schema version 與 `completed`／`skipped` outcome。
- 不以 display name 識別，也不儲存 LINE subject、token 或 Session 資料。
- 完成與略過都停止自動重播；同一居民 refresh 或再次登入不重播。
- 中途 refresh 沒有半完成寫入，會由第一步安全重新開始。
- Account A／B 使用不同 canonical resident ID，因此不共用狀態。
- 登出會關閉當下引導，但保留各居民完成紀錄；下一個 resident 只讀自己的 key。

## 手動重看

設定頁的「重新查看居民引導」以 `replay` presentation mode 開啟。重看過程不寫首次完成狀態、不呼叫遠端資料、不變更星星、EXP、等級、減碳或植物資料。

## Accessibility 與 responsive

- Bottom sheet 使用 `role="dialog"`、`aria-modal`、labelled-by 與 described-by。
- 開啟與換步會聚焦主要按鈕；Tab 留在 dialog；關閉後還原先前焦點。
- Escape 與明確關閉按鈕均可結束；首次關閉視為略過。
- Spotlight 只在 target 存在且可見時出現；找不到 target 時改用完整 backdrop。
- Bottom sheet 使用 `100dvh`、safe-area 與可捲動 max-height，不被底部導覽遮住。
- 系統與設定的 reduced-motion 都會停用進場位移。

## 零交易界線

引導與其控制器不含 fetch、Player mutation 或 canonical resource setter。第五步只聚焦既有 Preview 餐廳入口；原有 `restaurantExperienceEnabled()` 集中 gate 繼續封鎖 mission、Merchant、task-code、pending、polling 與 settlement 路徑。

## QA 矩陣

| # | 驗證 | 覆蓋 |
| --- | --- | --- |
| 1 | 首次 resident 顯示 | unit + browser |
| 2 | 未 authenticated 不顯示 | unit + source |
| 3 | loading 不提前顯示 | unit |
| 4 | 完整完成 | unit + browser |
| 5 | 可略過 | unit + browser |
| 6 | 完成後 refresh 不重播 | unit + browser |
| 7 | 略過後 refresh 不重播 | unit + browser |
| 8 | 設定頁手動重看 | source + browser |
| 9 | 重看不改正式資料 | source + browser |
| 10 | Account A／B 分離 | unit + browser |
| 11 | logout 後不繼承 | unit + browser |
| 12 | 中途 refresh 安全重啟 | unit + browser |
| 13 | spotlight 缺件 fallback | source + browser |
| 14 | 餐廳步驟零 transaction | source + network QA |
| 15 | reduced-motion | CSS + browser |
| 16 | Escape／關閉 | source + browser |
| 17 | focus management | source + browser |
| 18 | 375×667 | browser |
| 19 | 390×844 | browser |
| 20 | 375×690 WebView equivalent | browser |
| 21 | 1280×720 | browser |
| 22 | 1440×900 | browser |
| 23 | console 無 blocking error | browser |
| 24 | Player tests 全數保留 | automated suite |

## 2026-07-25 驗證結果

- Player TypeScript tests：47／47 passed（原 40 tests 全數保留，新增 7 onboarding tests）。
- `qa:resident-guidance`、resident content、Player UI manifest 與 runtime assembly：0 failures。
- Workspace lint、typecheck 與 Preview production build：passed。
- 首次 A 完成六步後回首頁，refresh 不重播；B 仍看到自己的首次引導。
- B 在第二步 refresh 後安全由第一步重啟；略過後 refresh 不重播。
- 設定頁可重看；Escape 可關閉；既有首次完成狀態不變。
- 375×667、390×844、375×690 LINE WebView equivalent、1280×720、1440×900：六步皆可完成，主要按鈕與關閉／略過入口可操作。
- reduced-motion 設定下引導仍可操作，CSS 進場動畫停用。
- QA network log：`GET /auth/player/session`、`GET /player/state` 與一次登出；missions、Merchant、task-code、pending、settlement、player events 共 0 requests。
- 首頁 canonical identity／資源、森林／樹屋、角色切換與永續小知識卡回歸通過；無 blocking runtime error。
