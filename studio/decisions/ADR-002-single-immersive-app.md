# LOOPER｜ADR-002｜單一沉浸式 App × 視覺擬 2.5D 的正式技術路線

**決策日期**：2026-11-13（臺灣）
**決策層級**：創辦人指定產品版本方向；本文件統一工程主路線與例外條件
**實作狀態**：決策已確立／正式美術與 iPhone 運行驗收仍 HOLD

## 產品版本裁決

- **唯一正式玩家版本：沉浸式 Looper 宇宙 App。** 不再製作獨立「一般介面版 → 遊戲版」過渡產品。
- 開發仍可先分階段做小範圍、真實可點擊的沉浸式成品。縮小交付範圍不代表降低視覺品質。
- 只使用原本核准的 `forest_clearing` 與 `treehouse_main` 世界；任務、背包、小書、森林小舖、真實店家、成長與兌換是 UI Surface／功能路由，不能擅自建立第三個遊戲場景。
- 「2.5D」是**看起來立體**的美術質感：角色固定插槽，僅原地短循環；場景切換而不跑圖／跳躍／尋路／自由探索／物理碰撞。

## 正式主路線（不需預設遊戲引擎）

- 維持 `apps/mobile` 現有 **React Native + Expo** 原生 App，不新建第二套正式 App。
- 使用受權威約束的可編輯 2D 分層美術、光影／接地影、前後景遮擋、固定鏡頭構圖。
- 原地動作：從已核准的角色母件製作短循環動畫（序列影格、spritesheet、透明影格或其他經 iPhone 驗證的格式），不以每格重新生 AI 圖替代 Canon。
- `react-native-reanimated`（已在現有 package.json）管理 UI、遮罩、轉場與動態；若常規原生 Image/Animated 層不足，僅針對複雜分層、遮罩和圖像合成引入 `@shopify/react-native-skia`。
- `Rive` 僅適用於特定已核准的 UI 動態／書頁等狀態機；它不是毛絨角色母件替代品。
- 製作美術可以使用 Krita／Photoshop／Blender；Blender 用於**離線**體積、毛髮、光影、原地動作的原件與預渲染，不要求 App 即時渲染 3D。
- Codex、Cursor、GitHub Actions 承擔工程代理與 QA；Expo EAS 負責可安裝 iOS／Android 測試版本與 CI。

## 宇宙最高權威仍有效

- [Visual Constitution](https://app.notion.com/p/3f0f195fa059816eb5b5cb3bf98365a0)
- [Character Canon V2 FINAL](https://app.notion.com/p/3f1f195fa059814fa860ea6035da0576)
- [World Foundation / FSSL](https://app.notion.com/p/40af195fa059817d9b8ecdf86320f304)
- [Scene & UX Authority](https://docs.google.com/document/d/1EFnLixNUDnwa-IqzSEGqRwKlbxjKZXL85CDI35xesZo/edit)
- [Visual Asset Register](https://docs.google.com/spreadsheets/d/1pU4kQN8ZyvgXHKzJRWCdNbmDaZsgl7ZisR6ZwvYcd1M/edit)

使用者 2026-11-13 提供的八張視覺圖，僅作明亮、溫馨、柔和、輕盈、有陪伴感的品質方向，不能假冒新的角色 Canon、森林空間、劇情、經濟制度。Forest V-F1 合成圖非 Clean Plate；仍缺真正可編輯原生母件；未經創辦人批准不得解鎖原動畫／融合。

## 何時才考慮 Godot 或 Unity？

**不預設安裝或整合。** 首先在原生 App 的獨立分支，以相同核准素材驗證以下完整體驗：

1. Lv1 Forest 維持核准視覺／圖層與遊戲 HUD。
2. 固定角色插槽能播放既定 Idle 原地短循環（正式美術未完成時只測工程插槽）。
3. 點知識書 → 原森林在後方變暗 → 書頁開啟、答題 → 正確收合返回；系統資料與特效分離。
4. 在 9:16、9:19.5 的 iPhone 真機執行，記錄畫質、FPS、掉幀、峰值記憶體、載入與前後台恢復。

**只有當真機證據顯示 React Native + Reanimated +（按需）Skia 無法達到關鍵互動或效能需求，而且排除素材格式／程式實作問題後**，才另建小型 Godot／Unity 技術比較案。不能為了「看起來像 2.5D」就切換引擎。

## PR #69 的處理

既有 Unity 工程 Spike 僅留作**可回溯獨立研究**，不再當正式 App 製作的必做工序。新契約把 `engineDecision` 改為 `EXPO_REACT_NATIVE_IMMERSIVE_PRIMARY` 並硬鎖單一沉浸式版本。既有美術 HOLD／正式主分支未合併的界線完全保留。

## 實際交付與待驗證

這份 ADR 與契約更新，只是**產品／技術決策與保護機制**，不是完成任何正式森林美術或 iPhone 遊戲成品。
