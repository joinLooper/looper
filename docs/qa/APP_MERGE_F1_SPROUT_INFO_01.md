# APP-MERGE-F1-SPROUT-INFO-01 | Forest V-F1 and Sprout Info Integration

日期：2026-10-23（Asia/Taipei）
來源：制度事件與畫面規劃 Work／事件盤點工作區
審核層級：Draft；**不合併／不部署／不得標示 Final**

## 本批真正完成的工程
- 五筆 Stage 01–05 的正式 Asset ID、原始名稱及順序已登錄於 `apps/mobile/src/f1-sprout-assets.ts`。
- 原場景按鈕 `sprout-hotspot` 繼續指向既有 `Forest` modal；新增 `SproutInfoContents` 為資訊／成果頁，現有中央植株 `assets/sprout.png` 不更動。
- QA fixture 可在資訊面板切換 Stage 01～05，且只更改畫面選擇；正式模式等待合法 CO₂e projection，不根據任務、澆水、等級或假的 0.8kg 導出權益。
- 退出資訊面板後恢復同一 Forest 元件、同一場景樹、同一背景 Image，避免返回重載另一張森林。
- `src/f1-runtime-art.generated.ts` 中的六張正式素材引用**仍為 null/空對應**。現在會顯示明確的素材待接入，不可誤認為六張 PNG 已完成工程接入。
- `scripts/f1-ingest-assets.mjs` 可接收六張正式 PNG 的 Windows/本地資料夾，逐一核對實際 PNG header／尺寸／透明度、記 SHA-256、原位複製，並生成 Metro 靜態 require 對應。缺少任一檔則不輸出假圖片。
- Placement/state manifest: `src/f1-sprout-placement-state.manifest.json`；stage 資料只限 `sprout_info_only`。

## 必須說清楚的素材交付缺口
- 使用者提供 `sandbox:/mnt/data/...` 是交接工作區當時的路徑，**目前工作環境沒有六張位於這些路徑的 PNG**。
- 找到 Library 中同名 `陽光瀑布森林秘境.png` 並目視核對了固定淨底；但它的原始 bytes 無法從目前的 Library/Project 檔案副本轉成可上傳 GitHub 的實際檔案。
- 目前尚未找到與五個正式檔名精確相符的本機原圖。Library 曾有近似 `image-gen-*.png`，不得當成正式件或改名充數。
- 現有 App 暫時仍用 `assets/forest-clearing.png` 作為明確標示的測試背景；它**不是**本批 `scene_forest_clearing_base` 原始 PNG，因此背景替換 Gate 尚未通過。
- 需由原工作區取回實際六份檔案並放到同一個本機資料夾，然後執行 `node apps/mobile/scripts/f1-ingest-assets.mjs --source <資料夾>`（在 repo 根目錄執行亦可），檢查 `apps/mobile/assets/f1/f1-originals.sha256.manifest.json`，並由美術本人確認來源。

## 路由／事件對照
- Scene: `forest_clearing`；Visual: `V-F1`；中央物件點擊：`sprout-hotspot`／`F1-SPROUT`。
- 內容：`F1-SPROUT-OBSERVE`、`F1-HUD-CO2-DETAIL`。
- 參照既有事件：`OB103`、`EV-CARBON-DETAIL`，不另發明 event/grant。
- 退出：Modal close → 原 `V-F1`，不重新導航、不重新載入主畫面、不重寫玩家資產。
- QA 狀態輸入：Stage 01/02/03/04/05；**不等同玩家真的已達成**。

## 人工與自動驗收必須區分
- 編譯／單元測試：以本 Draft PR GitHub Actions 相關工作結果為準。
- Browser：需要素材實際進入程式後截取 Forest／詳情／五階／關閉回 Forest 及 9:16／9:19.5 照片，檢查重影或漂移。
- Native Android：維持 CI 單獨檢查，不能用 Web 證據取代。
- iPhone Expo Go：必須真人掃描正確新 QR、確認 Git SHA、完成以上操作；目前**無新增 iPhone 驗收證據**。
- 背景和 5 張原始 PNG 目前缺少實際位元組，故 `ASSET_INGEST=BLOCKED`，正式整合不可標示 PASS/Final。

## 施工界線
- 遵守「視覺工作室創作 → 美術 Work 工程規格化 → Codex App 接線」；本批沒有生成或重新繪製素材。
- 既有 B07 五件已核准物件、HUD、角色與中央 planted sprout 不更動。
- 不碰玩家 ledger、不假造 receipt、不自動計算 CO₂e。
- 當正式圖像到位，才啟用 `APPROVED_F1_BACKGROUND` 與 `APPROVED_F1_SPROUT_INFO_IMAGES`，並提交獨立原件雜湊證據供中央核准。
