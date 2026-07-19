# Looper MVP｜玩家介面元件對照表 v1.0

- 建立日期：2026-07-18
- UI 基線：Looper UI Asset Workstream B v20／Manifest fragment v0.17.0
- Style Lock：Looper UI Style Lock v1.0 Approved
- 素材總數：69 個 `asset_id`／274 個狀態
- 實作位置：`apps/web`
- 實作分支：`codex/ui-central-player-assembly`

## 整合原則

1. 69 個 UI 家族依中央 Manifest 的 `asset_id` 與 `asset_version` 解析，不另建第二套 ID。
2. SVG 僅提供無字視覺外殼與圖示；繁體中文、任務碼、資源值、進度值、狀態與輔助文字全部由 React／HTML 即時呈現。
3. 前端只顯示後端回傳的正式資源；API 未連線時明示「離線預覽」，交易入口維持唯讀語意。
4. MVP 顯示星星、EXP、CO₂e、任務與券；活力值停用。動畫與畫面切換不控制玩家權益。
5. 導覽依 Master Spec 固定為「任務、星星兌換、我的森林、設定」；首頁由玩家頭像／首頁按鈕返回。

## 69 個 Approved 元件對照

| asset_id                  | 玩家端元件／用途  | 主要畫面           | live UI 內容                           |
| ------------------------- | ----------------- | ------------------ | -------------------------------------- |
| `ui_button_primary`       | 主要操作按鈕      | 任務碼、任務       | 送出任務碼、操作狀態                   |
| `ui_button_secondary`     | 次要操作按鈕      | 星星兌換           | 兌換狀態與券價                         |
| `ui_button_tertiary`      | 輕量／取消操作    | 任務碼、設定       | 取消、客服入口                         |
| `ui_carbon_progress`      | CO₂e 進度外殼     | 首頁               | kg CO₂e 與門檻                         |
| `ui_energy_progress`      | Approved 保留素材 | MVP 不顯示         | 正式版另開規格後才可重新啟用           |
| `ui_exp_progress`         | EXP 進度外殼      | 首頁               | 目前／下級門檻 EXP                     |
| `ui_dialog`               | 4 碼對話框外殼    | 任務碼             | 標題、說明、輸入值與結果               |
| `ui_empty_state`          | 空資料／離線外殼  | 物品庫、設定       | 空狀態原因與下一步                     |
| `ui_toast`                | 即時狀態通知      | 全域               | 成功、警示與同步訊息                   |
| `ui_bottom_nav_item`      | 底部導覽外殼      | 全域               | 四個導覽標籤與選取狀態                 |
| `ui_icon_button`          | 圖示按鈕外殼      | 全域、森林工具列   | accessible name 與 pressed 狀態        |
| `ui_resource_chip`        | 資源膠囊外殼      | 首頁、星星兌換     | Lv、星星數值與狀態                     |
| `ui_icon_back`            | 返回              | 任務碼             | 返回 accessible label                  |
| `ui_icon_chevron`         | 下一層／展開      | 任務、設定、物品庫 | 目的地由按鈕文字提供                   |
| `ui_icon_close`           | 關閉              | 任務碼             | 關閉 accessible label                  |
| `ui_icon_error`           | 錯誤              | 設定、連線         | 錯誤原因 live text                     |
| `ui_icon_info`            | 說明              | 首頁、設定         | 規則與文字大小說明                     |
| `ui_icon_warning`         | 警示              | 兌換、離線         | 券權益與離線警示                       |
| `ui_icon_loading`         | 載入              | 同步、按鈕         | `aria-busy` 與載入訊息                 |
| `ui_icon_question`        | 輔助提示          | 設定               | VoiceOver／TalkBack 說明入口           |
| `ui_icon_success`         | 完成              | 任務、toast        | 已完成／成功 live text                 |
| `ui_icon_lock`            | 鎖定              | 星星兌換、設定     | 未達條件與鎖定原因                     |
| `ui_icon_offline`         | 離線              | 全域、設定         | 離線預覽與唯讀提示                     |
| `ui_icon_retry`           | 重試              | 設定               | 重新同步 accessible label              |
| `ui_icon_sync`            | 同步              | 核銷、設定         | pending／同步狀態                      |
| `ui_icon_timer`           | 等待／倒數        | 任務碼、核銷       | 等待店家確認                           |
| `ui_icon_unlock`          | 已解鎖            | 設定、森林         | 功能解鎖說明                           |
| `ui_icon_menu`            | 選單／必要說明    | 設定               | 客服與必要說明                         |
| `ui_icon_notification`    | 通知              | 全域頭部           | 通知 accessible label                  |
| `ui_icon_profile`         | 玩家頭像          | 全域頭部           | 玩家名稱、等級                         |
| `ui_icon_preview`         | 場景預覽          | 我的森林           | 預覽 accessible label                  |
| `ui_icon_rotate`          | 物件轉向          | 我的森林           | 左右轉向 accessible label              |
| `ui_icon_save`            | 保存配置          | 我的森林           | 保存 accessible label                  |
| `ui_icon_sit`             | 坐姿保留入口      | MVP 不啟用         | 等待正式坐姿角色；runtime 維持 pending |
| `ui_icon_snack`           | 準備點心          | 我的森林           | 靜態預覽；不扣點                       |
| `ui_icon_tidy`            | 整理              | 我的森林           | 靜態預覽；不扣點                       |
| `ui_icon_character_tap`   | 角色互動          | 我的森林           | 角色互動提示                           |
| `ui_icon_light`           | 開關燈            | 我的森林           | 燈光操作提示                           |
| `ui_icon_water`           | 澆水              | 我的森林           | 靜態預覽；不扣點                       |
| `ui_icon_compost`         | 堆肥              | 後續規格           | MVP renderer 本輪不接線                |
| `ui_icon_forest_view`     | 查看森林          | 首頁、我的森林     | 入口與操作名稱                         |
| `ui_icon_home`            | 返回首頁          | 全域頭部           | 返回首頁 accessible label              |
| `ui_icon_treehouse`       | 樹屋入口          | 我的森林、物品庫   | 場景入口／物品名稱                     |
| `ui_icon_weekly_board`    | 本週任務板        | 首頁、任務         | 週進度與結算說明                       |
| `ui_focus_ring`           | Approved 焦點視覺 | 所有圖示按鈕       | 鍵盤焦點；另保留 CSS 系統焦點          |
| `ui_icon_backpack`        | 背包              | 我的森林、物品庫   | 分頁與物品狀態                         |
| `ui_icon_cancel`          | 取消              | 任務碼             | 取消 live label                        |
| `ui_icon_check`           | 完成／已裝備      | 任務、物品庫       | 完成與裝備狀態                         |
| `ui_icon_coupon`          | 折價券            | 星星兌換           | 券面額、券價與狀態                     |
| `ui_icon_equip`           | 穿戴／配置        | 物品庫             | 物品狀態與名稱                         |
| `ui_icon_knowledge`       | 永續小知識        | 任務               | 任務名稱與獎勵                         |
| `ui_icon_memory`          | 回憶              | 物品庫             | 分頁名稱與空狀態                       |
| `ui_icon_nav_exchange`    | 星星兌換導覽      | 全域底部導覽       | 星星兌換 live label                    |
| `ui_icon_nav_forest`      | 我的森林導覽      | 全域底部導覽       | 我的森林 live label                    |
| `ui_icon_nav_mission`     | 任務導覽          | 全域底部導覽       | 任務 live label                        |
| `ui_icon_nav_settings`    | 設定導覽          | 全域底部導覽       | 設定 live label                        |
| `ui_icon_source`          | 查看來源          | 任務               | 規格來源 live label                    |
| `ui_icon_task_code`       | 4 碼任務入口      | 首頁、任務、對話框 | 4 碼輸入與說明                         |
| `ui_icon_toolbox`         | 道具箱            | 物品庫             | 道具箱 accessible label                |
| `ui_icon_vouchers`        | 我的券            | 兌換、物品庫       | 券分類與持有狀態                       |
| `ui_inventory_card`       | 物品／券卡外殼    | 物品庫、星星兌換   | 名稱、面額、價格、持有狀態             |
| `ui_inventory_tab`        | 物品庫分頁外殼    | 物品庫             | 小物、我的券、回憶                     |
| `ui_settlement_card`      | 核銷結算外殼      | 任務、任務碼       | pending 與 settlement 說明             |
| `ui_skeleton`             | 載入骨架          | 設定、資料載入     | 載入狀態與 reduced-motion variant      |
| `ui_speech_bubble_left`   | 左角色對話        | 我的森林           | 角色 live 對話                         |
| `ui_speech_bubble_right`  | 右角色對話        | 我的森林           | 玩家 live 對話／大字版                 |
| `ui_speech_bubble_system` | 系統提示          | 星星兌換           | 權益與結算警語                         |
| `ui_task_card`            | 今日任務卡外殼    | 首頁、任務         | 任務、獎勵、狀態與操作                 |
| `ui_weekly_progress`      | 本週七日進度外殼  | 首頁、任務         | 1～7 日 live 進度與獎勵                |

## 玩家畫面組裝

| 畫面     | 已接入內容                                                          | 中央資料邊界                                                 |
| -------- | ------------------------------------------------------------------- | ------------------------------------------------------------ |
| 首頁     | 玩家頭部、Lv、EXP、星星、CO₂e、森林階段、今日任務、本週任務         | 不在前端自行結算資源；離線時標示預覽                         |
| 任務     | 今日三類任務、本週 7 天、4 碼入口、pending 結算卡、來源             | settled 前不顯示永久成功                                     |
| 星星兌換 | 星星餘額、平台通用券、券價、最低保障提示、我的券入口                | 兌換成功後才建立正式 entitlement                             |
| 我的森林 | forest／treehouse 場景、角色接地、T6／D9 靜態預覽、物品庫           | MVP 無活力欄位、無扣點事件；坐姿與 runtime mask 維持 pending |
| 設定     | Reduce Motion、系統文字大小說明、VoiceOver／TalkBack 說明、連線狀態 | 顯示偏好不改交易與權益                                       |

## QA 狀態｜2026-07-18

| 項目                           | 狀態         | 證據／限制                                                             |
| ------------------------------ | ------------ | ---------------------------------------------------------------------- |
| Manifest／registry 對照        | Pass         | 69／69，差異 0；274 個狀態                                             |
| master 完整性                  | Pass         | 69 個 SHA-256 與 v0.17.0 Manifest 一致                                 |
| live UI                        | Pass（靜態） | 343 份 SVG 無 `<text>`；繁體中文與數值由 HTML 呈現                     |
| Production build               | Pass         | Next.js 16.2.10 靜態頁建置完成                                         |
| 全 workspace TypeScript        | Pass         | 9／9 packages typecheck                                                |
| 既有 API regression            | Pass         | 9／9 tests；核銷冪等測試保留                                           |
| 本機 HTTP runtime              | Pass         | 頁面 200；69 master＋274 state＋Manifest 共 344 份公開檔案皆 200       |
| Dynamic Type                   | Not tested   | 已使用 rem／clamp、內容可換行；仍需 iOS 實機／模擬器驗證               |
| VoiceOver                      | Not tested   | 已配置語意、label、progressbar、live region；仍需 iOS 實機／模擬器驗證 |
| TalkBack                       | Not tested   | 已配置語意與最小操作區；仍需 Android 實機／模擬器驗證                  |
| Reduce Motion                  | Not tested   | 已支援系統 media query 與介面開關；仍需裝置 runtime 驗證               |
| 320／375／390／430 px 視覺尺寸 | Not tested   | CSS 響應式基線已完成；雲端測試瀏覽器無法連入本機位址                   |
| iOS／Android 實機              | Not tested   | 需要可執行的裝置環境、公開 preview 或 CI device farm                   |

## 下一個驗收閘門

1. 提供可由測試瀏覽器存取的 preview URL，或在 CI 接上 iOS／Android device farm。
2. 逐一驗證 320／375／390／430 px、iPhone SE／主流 iPhone／小型 Android／大型 Android。
3. 以系統最大字級重跑首頁、任務卡、4 碼對話框、物品卡與底部導覽。
4. 分別以 VoiceOver／TalkBack 完成「首頁 → 任務 → 輸入 4 碼 → pending → 返回」流程。
5. Reduce Motion 開／關各跑一次，確認動畫差異不改變任務與權益狀態。
