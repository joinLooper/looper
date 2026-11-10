# LOOPER｜現有 App 與製作資產依賴盤點

> 2026-11-10 查核 GitHub 分支與權威資料。這是一份工程工作清單，不升格產品決策。

| 已有工程 / 來源 | 實際位置 | 如何處理 |
|---|---|---|
| 原生 App 基底 | PR #54 → W2 系列，`codex/w2-05-worldbook-surface` | 繼承，禁止全部重做 |
| Forest UI / 知識書 | PR #56–60（W2），PR #68 Draft（QA 隔離） | 繼承事件結構；不預先合併未批准視覺 |
| Visual Asset 融合草稿 | PR #63–66 Draft | 只讀檢查，等待中央美術 Gate |
| Visual Constitution | Notion 正式文件庫 V3.3.2 / WSC01 | 必須優先遵守 |
| Character Canon V2 FINAL | Notion 正式文件庫 | 新姿態、新角度不可聲稱直接 PASS |
| Forest V-F1 | 941×1672 已核准合成畫面 | 是構圖參考，不是 Clean Plate；不准冒充獨立圖層 |
| Treehouse T0 | 窗位權威衝突 | HOLD，先釐清唯一來源 |
| Marmot / Rabbit 原生母件 | 已有核准單張與來源 SHA | 未確認真正可編輯動畫母件，不得直接做正式動畫 |
| Unity / Blender | 本分支建立唯讀工具／工程 Spike | 尚無本機運行與實機 QA 證據 |

**當前流程：** 一次只開一個正式引擎路線；用同一份 Canon、同一個 Lv1 Forest、同一個知識書互動事件驗證。美術對比圖不得導致自造角色、新場景或擅自更改正式世界尺度。

**不在本 PR 執行：** 合併主分支、部署 Production、改寫任何資產來源、推動正式遊戲玩法或執行需付費的帳號註冊。
