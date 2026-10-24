# LOOPER｜APP-ART-INTEGRATION-REFORM-01
**正式中央執行規範｜2026/10/24｜適用 PR #61～#65 及後續素材交接**

唯一身份來源：[Visual Asset Register / Asset Master](https://docs.google.com/spreadsheets/d/1pU4kQN8ZyvgXHKzJRWCdNbmDaZsgl7ZisR6ZwvYcd1M/edit#gid=770905708)。**不建立第二份素材總表、不改既有 Asset ID、不重畫既有 Approved 素材**。已核准 `scene_id=forest_clearing`, `visual_state_id=V-F1` 只代表目前 Lv1 的核准構圖；其他等級的場景、鏡頭、物件與熱區須依各自獲核准版本，不能用一張 Lv1 背景不停疊新物件。

## 六道入口檢查（沿用既有 Manifest、CI、Web/Native、iPhone QA）

| # | 自動檢查 | 不得自動冒稱通過的部分 |
|---|---|---|
| 1. 來源與版本 | 唯一 Asset Master ID、`scene_id/visual_state_id`、來源 ZIP/PNG SHA、檔名、使用目的；本機 source fingerprint 與交付版一致 | 中央真正核准該新版構圖 |
| 2. 檔案完整／用途 | ZIP CRC、完整 PNG decode、RGBA/尺寸、Manifest ↔ 原檔 SHA、Stage Bright/Dim 互斥、固定組只載入一個 Image、動態欄位不烘焙至固定圖 | 圖中文字是否是動態資料、角色 Canon 是否一致 |
| 3. 畫面比例／定位／遮擋 | **每個** `visual_state_id` 依自己的 source canvas/camera/placement 比對 9:16、9:19.5；物件未超界、熱區不重疊、遮擋幾何；沒有 placement 就攔截 | 構圖自然、光影融合、透明前後景遮擋等視覺 QA |
| 4. 互動／返回 | 既有 151 制度事件、807 路徑轉換與實際 `testID`、開啟/關閉/返回、QA 與正式帳本隔離；Web/Native 的真實操作結果分開保存 | 使用者真人操作感是否合理 |
| 5. 版本安全 | Git SHA + dirty/untracked 原件備份 + PNG/程式雜湊 + Metro bundle 識別，禁止未授權覆寫本機、Draft merge/deploy | 本機未提交檔的人工衝突裁決 |
| 6. 指定版本 iPhone | 正確 `scene_id/visual_state_id` + asset/source fingerprint、**至少一台實際 iPhone 原圖截圖**與各可用入口的點擊／關閉／返回紀錄；9:16、9:19.5 其餘比例由 Web／Native 自動化補足，不要求創辦人另找第二台手機 | 中央**真人**對此版本的美術與操作簽核 |

**五個完成狀態完全分開登記，不再相加為同一進度：**
`Visual Approved`（圖像構圖已核准）、
`Asset Ready`（實際圖檔/Manifest/尺度/用途完整）、
`Runtime Integrated`（核准實圖已在 App 執行）、
`Function QA Passed`（該版本 Web/Native 路由操作合格）、
`iPhone Visual QA Passed`（指定真機/素材版本經真人認可）。
程式不得因其中一項 PASS 自行替其他項蓋章。

**唯一工程執行入口**：`node apps/mobile/scripts/qa-art-integration.mjs`，已加進 `apps/mobile` 現有 `test` 指令，在 GitHub Mobile CI 每次自動執行，不增加另一本管理表。檢查結果會顯示六道 gate 與五個獨立狀態。需要驗證素材包時傳 `--archive ZIP路徑`（沿用現有 V2 格式稽核）；若需比對身份可使用從**既有** Asset Master 暫時匯出的唯讀 `--registry-snapshot`，不得把快照建為新的權威表。Web QA 可用 `--web-qa`；iPhone 證據可用 `--iphone-evidence`。即使格式工具全部成功，也只產生機器檢查結果，**不能自動授權美術、登入正式玩家帳本或部署**。`--release` 一律保留中央真人放行閘。

## 直接沿用成果／目前不重做的部分
- **PR #61–#62**：四級 QA 與 151 制度事件／807 畫面轉換的既有路徑骨架。只維護回歸測試，不重算系統設計、不創設新事件。
- **PR #63**：中央植株到資訊頁的單一入口、主畫面樹苗與資訊頁候選明確隔離。不得用主場景五階候選冒充資訊頁。
- **PR #64**：V-F1 Lv1 941×1672 整合、B07 原件、物件同 cover 縮放、熱區、HUD QA 與 iPhone 版面；Windows 已完成部分 dirty worktree 的安全合入，**遠端 GitHub 仍不能代表 Windows 已有相同 PNG**。不覆寫本機核准森林和非 null HUD。
- **PR #65**：中央小樹苗→「我的森林」資訊／成果頁→同一 Forest 返回、Stage01 default / Stage02–05 Bright/Dim 互斥、只讀 ledger/null 接口、固定組單一候選插槽。已取得 V2 ZIP：17 檔/CRC/12 PNG decode PASS，**dim 背景 RGB 卻宣告 RGBA、固定組已有烘焙進度、缺固定組幾何 placement、`APP_FORMAT_QA.json` CRC 記 PENDING**，所以仍 `VISUAL CANDIDATE / NOT ART_REVIEWED / NOT READY_FOR_INTEGRATION`。

目前 Visual Asset Register 的 Asset Master 可以查到 `scene_forest_clearing_base`（row 107），尚查不到新資訊頁固定組／若干子素材 ID；正式發放前須在**同一張 Master** 辨識及登錄既有交接身份，不另造編碼或新總表。候選的資訊頁不因程式插槽已寫好就獲得正式資產身分。

## 對創辦人的唯一回報格式（五項）
每個中央進度回報僅包含：
**① 玩家現在看得到／可操作什麼；② 工程自動攔截了什麼；③ 美術還欠什麼；④ 哪些指定版本需 iPhone 真人驗收；⑤ 下一個最優先動作。**
內部可附 PR/CI 原始證據，但不把型別測試成功、App 堆疊路由存在、Web 模擬器通過、候選圖片有效與 iPhone 美術 Final 混在一起。

**硬性禁止**：未經授權合併任何 Draft、部署正式環境、變更資源帳本、臆測樹苗成長門檻、重畫已核准角色或固定背景、直接替換 Windows dirty worktree。

## 2026/10/24｜R4 現場複驗的最小工程補強（沿用本規範）

中央已獨立取得 Library R4 ZIP（15,517,739 bytes、22 檔、SHA-256 `3dcfa5cad8e142cc64726ac0d3b304a7f6b0605b53503dd526dd0ffa2a27d746`）。12 張素材 PNG 的 RGBA、完整解碼與來源雜湊通過，固定組 941×1672 畫布的初步定位亦有數值；**沒有核准動態進度已修、畫面已 Final 或已接入 Runtime**。

本批新增 `apps/mobile/scripts/audit-f1-my-forest-delivery.py`：讀取實際交付 `manifest.json`、`placement.json`、`state_manifest.json` 與 `SHA-256.txt`，區分 `format_pass` 與 `layout_pass`。如提供壓縮檔，一律先稽核、不解包、不修改原始 PNG；真正來源 SHA 須從中央獨立交付紀錄另行指定，不能只相信壓縮包內自己聲稱的 SHA。V2 原版維持既有專用稽核，不拿 V2 常數錯判 R4。

複驗 R4 發現：`next_progress_fill` 缺 x/y/width/height/clipRect、五個里程碑缺顯示座標／尺寸、動態文字缺數值區幾何，且 9:19.5 的預檢圖上下各 70px 完全透明（整頁 contain）。**這些都必須讓工程檢查明確 BLOCKED_RUNTIME_LAYOUT，不得等到 iPhone 才發現。** 調暗森林背景採全螢幕 cover，固定組獨立等比 contain/定位，避免木牌裁切；圖像與真人核准仍是獨立狀態。

R4 已在工程專屬預檢中驗證「背景 cover + 固定群組 contain」能消除 9:19.5 上下透明條；此作法只證明雙圖層幾何方向可行，**未授權**修改固定圖內綠色進度或替它補上未核准的實際接入座標。

單一命令維持：`node apps/mobile/scripts/qa-art-integration.mjs --archive <R4原始ZIP路徑> --archive-sha 3dcfa5cad8e142cc64726ac0d3b304a7f6b0605b53503dd526dd0ffa2a27d746`；所需 Pillow 若不存在則封鎖真實 PNG 解碼驗證，不能自動安裝或假裝通過。沒有實際 ZIP 時 CI 僅檢查程式安全基線，不得宣告 R4 檔案/美術/iPhone 全部 PASS。

剩餘人工美術阻擋：固定組預填綠色進度、動態文案責任邊界、Marmot Canon/核准構圖。缺可編輯母檔時不以塗抹/重生圖取代原件；只提出最小安全修正方案供中央裁決。PR #65～#66 維持 Draft，不合併／部署，不改正式玩家帳本或 Windows dirty worktree。
