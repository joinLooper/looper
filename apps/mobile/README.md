# Looper W2-00 Native Shell

React Native + Expo SDK 57 + Expo Router。四個畫面均使用原生元件；沒有 Next.js、WebView 或正式 API。`web` 指令只供開發預覽及佈局測試，不是交付的 Native App。

## 啟動

在 repository root 使用 Node 22.13+ 或24.3+、pnpm10.13.1：

```sh
pnpm install --frozen-lockfile
pnpm --filter @looper/mobile start --lan
```

iPhone 與電腦在同一 Wi-Fi，使用支援 SDK57 的 Expo Go 掃描終端機 QR。這只屬開發預覽，不能宣稱已安裝獨立 Looper App。沒有 LINE、Google 或 Backend 設定。若 LAN 無法連線，檢查本機防火牆與 Wi-Fi 隔離；不需要公開帳號或 Secret。

2026-10-16 選擇 SDK57.0.30、RN0.86.3、React19.2.3。SDK58於10月15日剛釋出，但官方表示 Expo Go 商店版稍後才更新；SDK57較適合本輪 iPhone 預覽。版本依官方 SDK57 bundled mapping 與 `expo install --check` 核對，沒有使用 canary 或 RC。

## 本機測試內容

- 歡迎 → Forest Lv1 → 每日知識 → 任務與進度。
- 左樹樁開知識、中央偏左角色插槽開說明、右嫩芽記錄本機關心。
- 「測試工具」可切換 Lv1/Lv5、強制減少動態、模擬載入／錯誤及重設。
- Lv1 隱藏兔兔與樹屋入口；Lv5只顯示角色／入口位置測試，不實作樹屋內部。
- EXP20、星星6、能量8為固定 fixtures。作答或完成任務不發獎，不執行 Economy 計算。
- 狀態僅在 memory，App process 重啟即重設；沒有真實帳號或資料庫。

## 原生 Android 測試 APK

可從本 PR 的 Native Shell workflow artifact 取得 `Looper-W200-test.apk`（如該 run build 已成功）。這是嵌入 JS bundle 的 standalone release-variant 測試版，以 Expo 產生的 debug key 簽署；不是 Expo Go、不是正式商店簽章，也不發布商店。APK不能安裝到 iPhone。

有 Android SDK/JDK17 的本機可執行：

```sh
pnpm --filter @looper/mobile exec expo prebuild --platform android --no-install
cd apps/mobile/android
./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a,x86_64
adb install -r app/build/outputs/apk/release/app-release.apk
```

Windows使用 `gradlew.bat`。android/與ios/為生成輸出且忽略，原始碼以 app.json/Expo config為權威。不在 repository 儲存正式簽署 Secret。

## iPhone 獨立安裝 Gate

iOS需要 macOS/Xcode，以及能簽署目標裝置的 Apple Team / provisioning。TestFlight或Ad Hoc通常需既有 Apple Developer資格；本批不購買資格、不建立付費帳號、不要求公開憑證。Expo Go預覽、iOS JS export、Simulator build都不能替代 iPhone 獨立安裝或真人操作證據。沒有取得實機證據時，PHYSICAL_DEVICE_QA 必須保持 UNVERIFIED。

## 驗證

```sh
pnpm --filter @looper/mobile typecheck
pnpm --filter @looper/mobile test
pnpm --filter @looper/mobile build
pnpm --filter @looper/mobile build:web
pnpm --filter @looper/mobile exec expo install --check
```

`build` 是 Android/iOS JS export，不是 APK/IPA 編譯。Native Shell workflow另外執行Android原生編譯、簽章檢查、模擬器安裝及離線互動。既有主 CI 保留全部 Backend/Frontend/PG 回歸。四畫面的路由轉場與 feedback 尊重系統 Reduced Motion，強制開啟僅能更保守，不能覆蓋系統已開啟狀態。觸控區至少48dp；1000×1000場景等比置入可用區域，不裁切主要錨點。

## 美術與權限界線

土撥鼠與兔兔的正式透明素材未導入：`Character Asset Slot`保留 `source:null`、`ART_PENDING`。土撥鼠姿勢需求是自然站立、雙手輕放身前，並未自行生成替代角色。既有無角色森林與兩個道具只複製未改圖，來源及SHA在 assets/PROVENANCE.json。禁止將私人角色原圖放進此公開 repository。

沒有操作 Railway、Supabase、Auth、Economy、Gameplay、角色Canon或BATCH07。獨立 Draft PR 只供中央 Review。

## W2-01｜手機示範流程修正

- 森林底部顯示今日三項**本機示範互動**的完成數與下一步：每日知識、示範任務、關心嫩芽。進度一律由現有 DemoState 推導，不新增交易、獎勵或儲存。
- 作答錯誤不增加示範完成數；成功後回森林可看見完成狀態。即使使用者先完成任務，導引仍會提示其他未完成項目。
- 森林提供清楚的「回到歡迎頁」按鈕；返回不等於清除本機狀態，完整重設仍須從測試工具操作。
- 系統啟用減少動態時，停止正在進行的森林縮放動畫並還原原始比例；組件結束時清理動畫。
- 本輪維持 ART_PENDING、固定測試資源、離線運作與不連正式服務的限制。W2-00 原始 APK 無法驗證這些新改動，必須以新分支 CI 重新編譯產生新 APK。

## iPhone 實機檢查前提

SDK57 的 iOS Expo Go 預覽：先從 https://expo.dev/go 確認安裝與版本，且電腦 Expo CLI 與 iPhone Expo Go 使用同一 Expo 帳號登入。手機與電腦須可在相同網路互通；不要將測試 QR、Metro running 或 iOS JavaScript export 當成已取得獨立安裝 IPA 的證據。取得正式 iPhone 安裝包，仍須 Apple Team／裝置 provisioning 與核准的 macOS 或雲端簽署流程。

## W2-02 immersive Forest
The Forest is now an edge-to-edge scene. Four native-drawn prop studies provide
knowledge (book on the left stump), tasks (wooden note), backpack (cloth bag),
and more/settings (stone). These are replaceable presentation placeholders, not
approved final art. Character sources remain ART_PENDING.

Tasks open as a parchment notebook over the forest; they dispatch the existing
mission action. The legacy /knowledge and /progress routes remain accessible.
Backpack is an empty presentation container, not an inventory system.

World positions retain a 1000×1000 logical coordinate space; the background
covers the viewport while independently projected interactive props stay within
safe-area bounds. Prop artwork can be replaced inside ForestPropButton without
changing routes, test IDs or DemoState. The marmot/rabbit slots retain their
original positions and Lv1/Lv5 gates. No backend or reward changes.

Reduced Motion removes prop scaling and modal transitions. Android Back closes
the notebook before leaving the forest. Use the stone entry for local fixture
controls, error/loading recovery and the welcome return action.

W2-02 must receive its own iPhone QA; the W2-01 user's PASS is not inherited.

## W2-04｜玩家世界連續性（Progress / Knowledge）

本批只重構手機 UI 呈現，**不重新製作或更動 W2-03 的五件核准 PNG**，也不改動 `DemoState`、任務獎勵、Backend 或帳號。

- 點森林任務木牌會開啟原本核准的任務手札；手札內可切換到玩家進度，沿用同一張森林、核准的三列清單插畫與可捲動文字。
- 點樹樁上的知識書會在森林上打開紙頁閱讀區，答題及回饋保持原狀態；此區仍使用程式繪製的書頁容器，屬視覺候選，**不宣稱已製作正式翻開知識書的獨立美術**。
- 直接打開 `/progress` 或 `/knowledge` 時也先呈現森林與對應頁，不再渲染舊 `Page`、白底 `card` 和通用 `Button`。
- 收起書頁／手札留在森林；從直接開啟的路由收起時則導回 Forest。Android 返回鍵依照既有 Modal 行為處理。
- 仍保留 48dp 點擊要求、閱讀區捲動、系統 Reduced Motion、固定測試資源與 `ART_PENDING`；未新增其他場景或玩家玩法。
- W2-03 Web 視覺驗證額外檢查兩比例的進度、知識頁、答題、手札開關及直接路由。Web 通過不取代 iPhone 真人操作。

**驗收限制：** 這是 UI 架構與候選視覺整合。iPhone Expo Go 必須另行真人確認。依中央指示，Android 真人手機測試暫緩，絕不宣稱通過，也不因缺 Android 實機而重做核准美術。
