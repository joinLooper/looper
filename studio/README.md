> **2026-11-13 技術裁決更新**：本工作線屬隔離研究；正式主路線為既有 `apps/mobile` React Native + Expo 的**單一沉浸式 Looper 宇宙 App**。不做一般介面版過渡、不預設 Unity/Godot，即時 3D／跑圖均非必要。Unity Spike 僅供回溯研究，詳見 [ADR-002](decisions/ADR-002-single-immersive-app.md)。

# LOOPER｜Studio Production Foundation 01

> 日期：2026-11-10；狀態：**工程隔離候選 / 非正式引擎裁決 / 美術與 App 合併 HOLD**。
> 本資料夾是多工具製作產線的實際第一批工程工具，不是《宇宙工程書》的替代品，也不是已完成的遊戲。

## 唯一權威（來源優先）

- [Visual Constitution（有效）](https://app.notion.com/p/3f0f195fa059816eb5b5cb3bf98365a0)：視覺硬鎖與來源核對。不可把 V3/R6、L01-R3 風格方向自動當成新造美術 PASS。
- [Character Canon V2 FINAL](https://app.notion.com/p/3f1f195fa059814fa860ea6035da0576)：身分、輪廓、角色比例；土撥鼠 100cm／兔兔 95cm，耳尖與嫩芽額外高度未標定。
- [FSSL 與 World Foundation](https://app.notion.com/p/40af195fa059817d9b8ecdf86320f304)：自然優先、動物原生、原件先行；不得由一張圖倒推假透明素材。
- [Scene & UX Authority](https://docs.google.com/document/d/1EFnLixNUDnwa-IqzSEGqRwKlbxjKZXL85CDI35xesZo/edit)：`forest_clearing` 和 `treehouse_main` 才是 MVP 世界；1000×1000 logical canvas；Play Safe x80–920／y160–860。
- [Visual Asset Register（唯一素材進度表）](https://docs.google.com/spreadsheets/d/1pU4kQN8ZyvgXHKzJRWCdNbmDaZsgl7ZisR6ZwvYcd1M/edit)：本批工程 registry 只列**插槽**，不擅自新編正式 asset_id。
- 《世界美術憲章與可重用創作模板 V1.0》目前是**核准候選**，不升格、不得覆蓋已核准來源。

## 已實作的工具與工作

1. `registry/forest_slice_01.json`：固定場景／FSSL／圖層順序／角色素材缺口／HOLD／未知參數明示 null。
2. `tools/asset_gate.py`：純 Python 來源檢查、SHA-256 校驗、安全路徑、HOLD 狀態與 release gate。
3. `tests/test_asset_gate.py`：正常規格和負向竄改／冒名測試。
4. `tools/blender_readonly_inspect.py`：以 Blender headless 唯讀提取實際 .blend 母件物件／骨架／貼圖／Action／SHA 報告，不更動原圖。
5. `unity-spike/Assets/`：Unity 編輯器一鍵生成**獨立工程事件代理場景**，只測背景常駐、開書、暗背景、收書，不是正式美術。
6. `.github/workflows/studio-source-gates.yml`：自動執行 Python 結構測試，確認正式 Release 仍因缺藝術核准而停止。

## 本機／CI 驗證指令

```powershell
python studio/tools/asset_gate.py --root . --mode structure
python -m unittest discover -s studio/tests -v
python studio/tools/asset_gate.py --root . --mode release
```

最後一行目前必須回傳 exit code **4**（預期 HOLD）。結構檢查返回 0 只能證明文字與來源檢查規則通過，不能說明美術通過。

### Blender（僅稽核正式私有母件）

```powershell
blender --background "C:\PRIVATE\approved-master.blend" --python studio/tools/blender_readonly_inspect.py -- --report "C:\PRIVATE\studio-source-audit.json"
```

請在使用者本機安全路徑存放來源與報告；本 GitHub 倉庫目前為 public，不應推入個人持有的角色原圖、私人設計母件、授權不明音效或含密鑰的設定。

### Unity（工程事件測試，不冒充 Forest 成品）

1. 安裝 Unity Hub 與 **Unity 6.3 LTS**（初選版本；與其他現有遊戲專案隔離）。
2. 建立新的空白 2D Core 測試專案，將 `studio/unity-spike/Assets` 複製到 Unity 測試專案的 `Assets/`。
3. Unity 選單 **Looper → Engineering Spike → Create Interaction Scene**；此操作詢問是否保存原場景且不覆寫已有的測試場景。
4. 打開 `Assets/LooperSpike/Scenes/ForestInteractionSpike.unity`，以直式 Game View 播放：開知識書 → 留在森林上方變暗 → 關閉返回。
5. 標記 `ENGINEERING_INTERACTION_ONLY`；沒有 Canon 角色／正式背景／完整可編輯書頁／手機效能證據，不得使用 Art PASS 字樣。

## 重要現況與工程決策

- 正式產品是獨立 **iOS / Android App**，LINE 非遊戲主容器。
- 現有 `apps/mobile` 使用 React Native + Expo，存在於尚未合併的 W2 連續分支；本工程以 `codex/w2-05-worldbook-surface` 為起點，未動 main，未合併其它 Draft PR。
- Unity 作為主引擎候選；Unity 全 App vs Unity as a Library + Expo 的整合比較尚未在實機跑測，**不宣稱勝出**。
- 不啟用角色新動畫、Forest/Treehouse Fusion、Sprite 或正式 App 合併：既有 Authority 尚有原生素材與空間尺度等缺口。
- 《宇宙工程書》中的 2.5D/3D 質感不是程式模擬用純色方塊；工程代理只驗互動，不代表美術風格。

## 下一個可驗收交付 Gate（順序不可跳）

- **G1 SOURCE**：取得授權及具 SHA 原生可編輯來源，區分 approved board 與真正可動畫母件；原圖零像素未授權修改。
- **G2 ART**：建模／分層／共通光影測試符合 Visual Constitution、Canon、L01-R3 與 FSSL；創辦人逐項核准。
- **G3 ENGINE**：Unity 互動、物件遮擋、動畫循環、知識書視窗能使用正式素材而非代理。
- **G4 NATIVE**：同場景對比 Unity 獨立 App 和 Expo 原生整合，實測冷啟動、前後台恢復、記憶體、FPS、觸控及 iOS 畫面比例。
- **G5 INTEGRATION**：確認輸入事件對應既有 151 事件／807 路徑系統，後端減碳／星星正式記帳分開核對，不新增未授權玩法。

## AI／人員責任

- **中央（ChatGPT）**：來源追溯、拆工、規格鎖定、工程與 QA 報告；不得以自己聲稱替代實際運行。
- **Blender / 專業美術／動畫師**：原生母件、建模、材質、綁骨、可回溯材質／姿態變更。
- **Unity / Codex / Cursor**：實際場景、程式、工具、真實編輯器運行；需先具備本機連線／可執行環境。
- **GitHub Actions**：程式規格與自動檢查；不能判斷畫面美感。
- **創辦人**：保留不可替代的藝術、主引擎切換、正式合併／發行裁決。

本文件僅是新建立的**可驗證製作起點**，無法取代尚缺的正式母件、Unity 編輯器執行及 iPhone 實機驗證。
