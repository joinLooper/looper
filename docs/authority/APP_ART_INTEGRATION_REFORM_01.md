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
