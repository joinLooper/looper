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

## 2026/10/24｜R5 實際 ZIP 中央獨立複驗（禁止自行宣告 Final）

Library 原始候選檔：`F1_MY_FOREST_INFO_REBUILD_02_R5_CANDIDATE.zip`，**19,098,123 bytes、25 檔、SHA-256 `7beeaa072e5df9715c7e80046d23294d6705dd09039d0e07b1f05e33133c0fc3`**。中央重新讀取 bytes：CRC PASS、17/17 PNG 解碼及 RGBA、SHA 與 Manifest PASS；其中 **12 張 `f1_*.png` 原圖與 R4 位元組完全相同**。R5 新增 `milestone_slots` 9 組圖位與 `dynamic_text_fields` 6 組數值區，已通過來源畫布與身份／規格檢查；勿因 R4 舊欄位缺失而反覆退件。

真實版面阻擋仍存在：R5 ZIP 沒有新版 `r5_recomposition_9x16.png`、`r5_recomposition_9x19_5.png`，`safe_area.phone_profiles` 繼續引用 R4 兩張圖且標 `fit=contain`；其中 360×780 的 R4 預檢圖上下各 70px alpha=0。另一項實際數值碰撞：`milestone_values` y=1260～1320 與五個里程碑圖位 y=1300～1420 **各交疊 20px**。這些不等於圖片檔案格式失敗，而屬 `BLOCKED_RUNTIME_LAYOUT`。原 R5 `APP_FORMAT_QA.json` 的 `dual_phone_recomposition=PASS_PRECHECK` 不能代替中央雙比例全畫布與相互遮擋驗證。

已強化同一份 `audit-f1-my-forest-delivery.py`：接受 R5 既有的 `milestone_slots`／`dynamic_text_fields`，維持 V2/R4/R5 身份兼容，獨立驗 SHA/PNG、檢查當批 preview 來源與長手機 alpha、背景 cover/固定組 contain、各階狀態一致性、數值區與圖片重疊、動態資料正式帳本來源。未提供真實 ZIP 的 GitHub CI 只檢查工程基線，不能宣告 R5 bytes／視覺 PASS。

中央另使用原始 R5 PNG **零畫素修改**，產生 360×640／360×780 技術預覽（背景獨立 cover，固定組獨立等比 contain），兩張均 alpha 最小 255，僅供定位參考，不屬正式角色／進度修復。證據包存於 Library `/Looper/VisualReview/F1-MyForest-Info/LOOPER_R5_CENTRAL_AUDIT_AND_LAYOUT_HANDOFF_20261024.zip`。

美術仍須：固定組移除預填綠色進度與非固定數值（缺可編輯母檔須中央另裁決最小局部方案）、按封版 Canon 核對角色。工程僅需將候選配置改成兩層適配與**當批 R5** 實際回組，依核准構圖調整里程碑圖位／數值區避免碰撞後複驗；12 張原始素材不重製。本批狀態為 **FORMAT PASS / LAYOUT BLOCKED / VISUAL CANDIDATE / ASSET READY NO / RUNTIME NO / iPhone Art QA NO**，PR 仍 Draft，不覆寫 Windows、不改正式帳本、不部署。

## 2026/10/24｜R6 一次收尾與 iPhone QA 入口（唯一規範，無平行資產表）

已從使用者真正上傳的 R5 ZIP **19,098,123 bytes** 來源進行單批定點收尾，交付 `F1_MY_FOREST_INFO_REBUILD_02_R6_APP_QA_CANDIDATE.zip`。**外部 SHA-256**：`07d95d741cb2e6ea5a1f82429a7f6d1d79b8c1b4cffe194854ad77133671dc75`，ZIP **21 檔**。中央同時讀取來源、獨立稽核：ZIP CRC／15 PNG 完整 RGBA／Manifest+SHA／9 Stage 幾何／6 動態欄位幾何／9:16 和 9:19.5 全畫布 alpha=255，均 PASS，`layout_blockers=[]`。R6 檔案已存 Library `/Looper/VisualReview/F1-MyForest-Info/`。

**像素責任明確**：保留 R5 十一張來源 PNG 的原始 bytes，僅對 `f1_my_forest_static_character_info_group.png` 的進度槽（1024×1536 母圖中 x696–836/y1014–1065）以**同張來源右側空白槽紋理**進行局部重建、清除固定綠色進度；絕不冒稱找回可編輯母圖。角色、木牌與其餘源像素未改。固定標題「目前已種下」「累計減碳」「下一株進度」屬固定文案，不是假的帳本數字；所有真實值仍為 `null`，資訊頁顯示「—」。里程碑影像與文字已分離到木板內，移除 R5 的重疊和圖像落板外風險。

**工程 QA 接線，不是正式美術升格：**
- 保留 `apps/mobile/src/f1-my-forest-info-art.generated.ts` 所有正式欄位為 `null`，以及 `F1_MY_FOREST_RUNTIME_ART_APPROVED=false`。
- 新增獨立 `f1-my-forest-r6-qa-art.generated.ts`（預設全 null）、`f1-my-forest-r6-qa-preview.tsx` 與只讀、衝突即阻擋的 `f1-enable-my-forest-r6-qa.py`。只有 QA 模式、`__DEV__` 且 `EXPO_PUBLIC_MY_FOREST_R6_QA_ART=1`，再加真正 R6 QA 圖已匯入，才顯示候選全頁；正式玩家路由仍不使用候選 PNG。
- Windows 安全匯入：先完整保存 staged／unstaged／untracked，**不得整份 checkout PR #66 或覆蓋已核准本機 Forest/HUD**，採隔離 worktree 逐檔合入；使用者自行取得 Library R6 ZIP 後，先執行 `py -3 apps/mobile/scripts/f1-enable-my-forest-r6-qa.py --archive "<R6 ZIP 完整本機路徑>" --sha 07d95d741cb2e6ea5a1f82429a7f6d1d79b8c1b4cffe194854ad77133671dc75`（唯讀），驗證後加 `--apply`（只新增 QA 圖與 QA generated require，不碰正式源圖／資料）。其後以 dev Expo 啟用 R6 QA 選 Lv1，iPhone 驗證中央嫩芽→R6 成果頁→Stage01～05 QA 狀態→關閉返回同一森林。
- QA preview Stage02～05 若示範 Dim 圖為**美術測試樣本**，不代表正式解鎖；真實里程碑仍由正式帳本單一來源決定。
- Native「回到歡迎頁」在前次實測會落到 Launcher，現改用 Expo Router `router.navigate("/")`，以真正安裝 APK 重跑並留證據，未取得 Native PASS 前不得宣告完成。

**尚需且不可自動蓋章**：使用正式 Character Canon V2 FINAL 原圖做人工並排核准；視覺合格後才能判 `Visual Approved`。唯一 Visual Asset Register 中 R6 候選資產身份需中央確認；正式圖片 Runtime 接入、用指定 SHA 的 iPhone 真人操作與畫面簽核各自為獨立狀態。絕不將本 ZIP 格式/版面 PASS 算成已合併、已部署、已讀寫正式玩家資料或 iPhone PASS。


## 2026/10/24｜中央最新裁決：我的森林核准原圖優先於 R6 自行回組

使用者於 2026/10/24 再次提供 **唯一正式全畫面視覺參考**，明確指示：「這才是我要的『我的森林』；要求素材根據這張畫面製作；不要隨意更改。」

- 場景：`scene_id=forest_clearing`；**成果內頁**：`visual_state_id=V-HUD-CARBONDETAIL`（不能以 Lv1 主畫面的 `V-F1` 取代）。
- **原圖 941×1672 RGBA，2,792,328 bytes，SHA-256：`b324e4cc37d52d04ecc730532f027fb990b8cc96e970e5f97916992f14652081`**。
- 永久來源：**Looper Library** `/Looper/VisualReview/F1-MyForest-Info/V-HUD-CARBONDETAIL_APPROVED_VISUAL_REFERENCE_20261024.png`（不得拿 R6 重繪圖或技術回組替代）。
- **視覺基準優先權**：使用者此原圖 > 既有交付之整張美術參考 > R6 QA 構圖預覽/工程為避免重疊而自行修改的位置。R6 格式與碰撞檢查 PASS 只代表該候選版本自己的技術檢查，不代表它符合核准參考圖。**任何要移動、縮放、重排主視覺者，先提出與原圖的前後差異，經中央明確批准後才能改。**

### 必須原位保留的畫面結構

1. 森林全版調暗背景與右上獨立圓形 X 關閉按鈕。
2. **左方土撥鼠**（頭頂嫩芽、綠色領巾、神情、姿態、毛感）坐在樹樁上；右方有「我的森林」木牌，下面兩行固定副文案；彼此大小與相對位置不得隨意修改。
3. **中央唯一成長嫩芽**，與土壤、石頭、花草一體銜接；不得替換成獨立盆栽群或重排背景。
4. 中央偏下 **淺色大型橫向木製三欄資訊面板**：「目前已種下」、「累計減碳」、「下一株進度」，保留三欄分割、圖示、進度槽及原視覺位置。
5. 淺色資訊板**下方另有一整塊獨立深棕色文字說明木板**，不得省略、合併進三欄資訊板或搬到里程碑下方。
6. 最下方 **五株里程碑**在暗色森林地面及細木軌上、說明木板的**下方**，每株有各自名稱與 kg 標示；不得改成五張平面的圖卡，也不得把它們塞進說明木板內。
7. 全局光影、透視、比例、前景遮擋與留白維持原圖，包含長手機延展時的構圖取捨。

原畫面示意數值（例如 3 株、6.8 kg CO₂e、0.8/2.0 kg）僅是**文字與進度的設計位置**，不代表正式玩家資料。正式 App 必須以帳本資料填入相同位置；如無資料顯示安全空值。圖上里程碑的 kg 文案亦不授權工程自行推導制度解鎖規則。**只允許在維持視覺比例與位置的前提下技術拆層、透明素材輸出、畫面適配與動態資料替換。**

### 立即生效的工程封鎖

- 先前 R6 自行重新配置的畫面**不符合本次核准的完整構圖**。其 QA renderer（`f1-my-forest-r6-qa-preview.tsx`）即使在開發旗標啟動下亦不得顯示，`R6_QA_VISUAL_COMPOSITION_APPROVED=false`；`f1-enable-my-forest-r6-qa.py --apply` 明確拒絕。保留原 R6 ZIP、程式及格式驗證紀錄作為歷史候選，但**不得將 R6 標為 Final、Runtime Art Approved 或 iPhone Visual QA Passed**。
- `f1-my-forest-info-contract.ts` 記錄獨立來源 SHA／Library path；`qa-art-integration.mjs` 與原本 Mobile test 驗證該引用存在且 R6 無法自行解除封鎖。不能把原圖另建為第二份 Asset Master，也不可編造 Asset ID。
- 未來施工直接以這張原圖「分層與數據化」，**不重新發明整頁構圖**。任何完整回組必須與核准原圖並排核對，而非只檢查 PNG RGB/RGBA、CRC、無透明帶或圖形不碰撞。

**裁決區分**：本次使用者已**核准整頁視覺構圖參考**；但既有 R6 PNG 拆件是否具有同樣畫面、APP 的 `Asset Ready`、`Runtime Integrated`、`Function QA Passed` 與 iPhone 真機驗收**尚未自動通過**。PR #65／#66 持續 Draft，不合併、不部署、不改玩家帳本或 Windows dirty worktree。


### 原圖與真實畫面的像素構圖比對（QA 防呆）

只認 Library 原始參考圖 `V-HUD-CARBONDETAIL_APPROVED_VISUAL_REFERENCE_20261024.png`（SHA `b324e4cc37d52d04ecc730532f027fb990b8cc96e970e5f97916992f14652081`）。新增 `apps/mobile/scripts/verify-my-forest-visual.py`：讀取實際 App 截圖、驗來源 bytes、比對 X／土撥鼠／木牌／中央嫩芽／三欄資訊板／獨立說明板／下方五株，僅屏蔽真正動態的數值區；缺來源、透明帶、構圖差異均 FAIL。**已實測拒絕舊 R6（7／7 區域差異），接受核准原圖的等比測試版本（7／7 符合）**。9:19.5 因延展沒有獨立核准構圖，即使中心內容相似也仍需真人確認背景延展與安全區，不自動標 Visual/iPhone PASS。

程式入口沿用唯一 `qa-art-integration.mjs`，只在附上真實資料時執行：`--approved-reference "<Library 原圖的本機路徑>" --visual-capture "<當次 App 截圖路徑>" --visual-profile 9:16`（長手機用 `9:19.5`）。可選擇另行運行 `verify-my-forest-visual.py --reference ... --rendered ... --profile ...` 產生 JSON 差異結果。**這些檢查不能代替正式素材接入、玩家帳本或 iPhone 真人驗收。**

如需直接在手機查看核准原圖，僅於安全合併的開發工作樹以 `f1-enable-my-forest-canonical-qa.py --source "<Library 原圖本機路徑>"` 先做唯讀 SHA 預檢，成功後加 `--apply` 安裝**QA 專用**圖片；再以 `EXPO_PUBLIC_MY_FOREST_CANONICAL_REFERENCE_QA=1` 的 Expo DEV + QA level 開啟中央嫩芽。這是**含示範數值的靜態對照畫面**，不會取代正式的動態成果頁、正式素材 null Gate、已核准主畫面或正式玩家帳本；QA 圖檔不推入 Git，也不覆寫 Windows Forest/HUD。關閉熱區對準核准原圖右上 X，返回同一森林。


## 2026/10/24｜核准原圖的動態數值工程 QA（不改構圖）

遵守真正核准的 `forest_clearing/V-HUD-CARBONDETAIL` 941×1672 全畫面構圖，正式原圖 SHA `b324e4cc37d52d04ecc730532f027fb990b8cc96e970e5f97916992f14652081`。

- 實際工程來源包 `LOOPER_MY_FOREST_CANONICAL_DYNAMIC_QA_V1.zip` 已保存同一 Looper Library 資料夾 `/Looper/VisualReview/F1-MyForest-Info/`，外部 ZIP SHA `a22be2a48a05710b57597539a8094745b72b17dfc5a9a1c7a5f5cf4a633fba94`（4 檔、CRC PASS）。
- 包內包括 **原圖完整原始位元組**及 `V_HUD_CARBONDETAIL_DERIVED_QA_EMPTY_VALUES.png`（SHA `9cade6ab742dc14cef5188dc7cd0ac2ca094df8a58067b6fa5b97030566f21b7`）。只有來源原圖的「已種數量、累計碳量、下一株進度文字、預填綠色進度」四個指定矩形內做**衍生素材級的中性化**。先前的人物、木牌、說明板、下方五株等像素及 alpha 均 100% 不變；工具實算其他所有像素差異 `0`，不代表 QA 中性化藝術已獲正式核准。
- 衍生候選用既有原包空白木質欄位紋理與來源像素處理，**原始核准參考圖從未修改或覆寫**。里程碑圖案與下方 kg 目前仍留在原圖示意狀態，尚未取得與原圖像素一致的 Bright/Dim 替換來源，所以**不可把此畫面當成正式帳本解鎖結果**。
- PR #66 僅新增 dev-only `f1-my-forest-canonical-dynamic-qa.tsx`、pure model、SHA-pinned null 預設 art generated source、`f1-enable-my-forest-canonical-dynamic-qa.py` 及嚴格測試。**三項數值與進度只能由 `FORMAL_RESOURCE_LEDGER` 唯讀快照更新**；沒有連接時顯示 `—` 且不填綠條，超額進度只做 0～100% 顯示 clamp，不能修改帳本本體，也不能依 Lv／EXP 假造 CO₂e/里程碑。QA Stage 狀態與資產顯示分開。
- 匯入：在 **隔離且已備份** 的 Windows 開發工作樹，`py -3 apps/mobile/scripts/f1-enable-my-forest-canonical-dynamic-qa.py --archive "<Library 原包完整本機路徑>" --sha a22be2a48a05710b57597539a8094745b72b17dfc5a9a1c7a5f5cf4a633fba94` 先唯讀預檢；通過後加 `--apply`，只新增 gitignored QA PNG、替換**尚未更動的 QA 專用** generated import，不動正式 Forest、HUD 或 `f1-my-forest-info-art.generated.ts`。開發環境 `EXPO_PUBLIC_MY_FOREST_CANONICAL_DYNAMIC_QA=1` 且 QA level 才能預覽；QA 關閉鈕仍返回原森林。
- 匯入器除了 ZIP 與 PNG SHA，也會**逐像素比對**原圖／衍生圖，驗證四個數值區以外沒有任何圖像像素、alpha 改動；其他位置更改直接拒絕。此防呆比僅相信 ZIP manifest 宣稱的 `outside_masks_pixel_equal=true` 更嚴謹。
- **長 iPhone 安全約束**：9:19.5 的版面只等比顯示核准原圖，明確不允許用同張圖另一個 `cover` 疊出重複/鏡像條帶；原設計畫面如何自然延伸尚需核准技術構圖與真機截圖，不能當作正式滿版 iPhone PASS。GitHub Web CI 未包含私人 QA 素材檔，不可把功能通過直接當成真實素材視覺驗收。

**保留獨立五狀態**：原完整構圖 Visual Approved=YES；衍生數值空底圖 Asset Ready=NO（尚需藝術 QA）、正式 Runtime Integrated=NO、Web 功能以已執行的 CI 為準、iPhone Visual QA=NO。PR #65/#66 保持 Draft，不合併／部署、不碰 Windows dirty tree／正式玩家帳本。
