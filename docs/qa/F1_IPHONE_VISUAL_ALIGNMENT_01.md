# F1-IPHONE-VISUAL-ALIGNMENT-01｜Forest 原圖空間與兩行 HUD QA

日期：2026-10-23（Asia/Taipei）
來源：iPhone Expo Go 實際截圖 `IMG_5758.jpeg`（706×1536）；本機交接 HEAD `c1c3fd4926f7ddb00c31e6410427bab88176d1ef`。

## 中央觀察
- F1 PASS 背景已顯示，但知識小書、任務木牌、布包與更多吊牌縮小、漂離核准構圖。
- Forest HUD 目前只有白色本機測試字串，未引用手繪兩行外殼。
- 土撥鼠顯示 ART_PENDING；5階資訊頁與主畫面嫩芽分層保持隔離。
- 截圖右側藍色齒輪需另查開發／除錯層來源，不能視作核准更多吊牌。

## 根因
- `worldRect` 使用 1000×1000 的位置正規化，但圖片尺寸保持 raw px；F1 淨底使用 941×1672 的 `cover`，且互動容器原有 safe-area 內縮，物件不隨底圖做相同縮放和裁切。
- 舊 W2-05 Native 測試浮層與正式美術層分工不同，HUD PNG 沒有進入主畫面 Runtime。

## 本 PR 修正（Draft）
- `src/f1-scene-projection.ts`：唯一 941×1672 cover 投影，使用實際背景相同的 scale/offset 及必要安全邊緣補正；座標為待 iPhone 複驗的候選 placement。
- `app/forest.tsx`：所有道具、Sprout、角色 QA 插槽共用同一座標來源與手機全幅容器；移除知識書下方額外小樹樁 PNG；保留原有 onPress／route／ledger 隔離／B07 正式 sprite 像素。
- `src/f1-qa-hud-preview.tsx`：僅 QA 模式且已匯入符合 SHA 的 `F1_HUD_TWO_ROWS_CANDIDATE.png` 時，顯示兩行圖形 HUD 及測試數值；Lv1／2 不顯示 Energy。PNG 在 Recovery ZIP 的 `03_HUD/` 內，SHA-256 `1f7a554640cd6137fde7d45193f6960d41f3a931b6ce85684364bf7a403a5ea1`、1175×457 RGBA。此 HUD 仍是候選、非 Final。
- `scripts/f1-enable-qa-hud.mjs`：由 Windows Codex 在核對檔案 SHA 後匯入候選 HUD，產生 Metro 靜態 require。GitHub PR 中維持空值，不上傳未核准候選圖片。
- `tests/f1-iphone-alignment.test.ts`：9:16、9:19.5、原 iPhone 706×1536 對應點的相同 cover 矩陣與入口完全可見檢查。

## 不得跳過的 Gate
1. 使用者電腦 `D:\Looper-INTEGRATION01` 的最新本機分支可能未推送；先保存 `c1c3fd4` 和未提交內容。不可硬重設或讓遠端 PR 覆蓋本機背景接線。
2. 安全擇要整合 PR #64；在有候選 HUD 原件情況下，可執行 `node apps/mobile/scripts/f1-enable-qa-hud.mjs --source <PNG>` 啟用 Expo Go 的**候選**預覽。必須標記 QA，不得自動升格 Final。
3. 重新在 iPhone 看 9:16／9:19.5：知識小書回到左樹樁、任務木牌位於左下、布袋位於右下、吊牌位於右上；點擊每個入口都能進入、關閉、返回。
4. 先核准 placement，再談正式角色、主場景五階植株與資訊頁五階；不要用任一主場景候選取代資訊頁 sprite。
5. Web tests、Native tests 與 iPhone 真人 QA 各自計算，不將 CI 的圖片輸出推定為實機 PASS。
6. 保持 Draft、無合併、無部署、無正式玩家帳本改動。
