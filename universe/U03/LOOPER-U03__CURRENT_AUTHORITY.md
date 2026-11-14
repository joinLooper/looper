# LOOPER-U03｜第三代宇宙工程｜唯一現行入口

**世代鎖：LOOPER-U03 / LOOPER_UNIVERSE / ACTIVE。**

## 版本分類（禁止混用）

| 世代 | 正式名稱 | 狀態 |
|---|---|---|
| `LOOPER-U01` | 生日版 | `ARCHIVE_DO_NOT_USE` |
| `LOOPER-U02` | APP MVP 版（先畫完整畫面再拆件） | `ARCHIVE_DO_NOT_USE` |
| **`LOOPER-U03`** | **Looper 宇宙｜沉浸式遊戲 App** | **`ACTIVE_ONLY`** |

第三代才是唯一現行的視覺、生產與正式 App 工作線。過去 U01／U02 或 W2 檔案、Canvas LIFF、App MVP 合成背景、生日版小書及任務圖不能作 U03 驗收材料。舊版保留但不接入。

## U03 須遵守的最高來源

- [U03 現行中央索引（Notion）](https://app.notion.com/p/418f195fa05981589125e6af233cb76a)
- [宇宙 Visual Constitution（V3 是藝術規範版本，不是產品世代）](https://app.notion.com/p/3f0f195fa059816eb5b5cb3bf98365a0)
- [Character Canon V2 FINAL（Canon V2 不是 U02）](https://app.notion.com/p/3f1f195fa059814fa860ea6035da0576)
- [FSSL 與 World Foundation](https://app.notion.com/p/40af195fa059817d9b8ecdf86320f304)
- [宇宙工程書3 世界美術憲章（候選條款不冒充核准）](https://app.notion.com/p/40bf195fa0598119b280ffc662b01d06)
- [Scene & UX](https://docs.google.com/document/d/1EFnLixNUDnwa-IqzSEGqRwKlbxjKZXL85CDI35xesZo/edit)
- [U03 唯一素材主表（保留原 Asset ID 與歷史台帳）](https://docs.google.com/spreadsheets/d/1pU4kQN8ZyvgXHKzJRWCdNbmDaZsgl7ZisR6ZwvYcd1M/edit#gid=1830063114)

## 絕對製作方法

**宇宙工程書／高階美術語法 → 源自核准來源的獨立可編輯角色、物件、場景母件 → 同源材質／光影與比例 → 場景固定位置組裝 → 原地小幅循環動作及點擊操作 → 沉浸式原生 App 實機驗收。**

- 2.5D 僅為視覺上的精緻立體感，無角色自由移動／跑跳／尋路。
- 場景只在 `forest_clearing` 與 `treehouse_main` 切換，知識書、背包等是既有界面，不能另造新世界場景。
- 永久保留原圖 bytes 與 SHA；不能強行改名、重畫或覆蓋核准圖片。新增 U03 製作件使用 `LOOPER-U03__DOMAIN__AssetID__ROLE__RNN.ext`，原始名字以 sourceAlias 索引。
- U03 視覺展示館只能消費核對過的 U03 manifest，不准從 `apps/mobile/assets` 或 W2 舊素材全掃描補圖。沒有 U03 證據就展示 `PENDING`，不得用舊版畫面湊數。
- U03 資產創辦人美術核准、可編輯母件檔、場景融合、App 真機狀態皆需獨立查驗。

## 舊工程在此版本的地位

U01 與 U02 的雲端與 GitHub 檔案保留追溯，但應在讀取、比較、下載、製圖、AI Agent 工作前核查來源代號。若是 `U01/U02`、W2 舊版，直接標記 `ARCHIVE_NOT_ELIGIBLE`，不得轉入 U03。**技術概念／制度需求要復用也需重新對照現行宇宙工程書及創辦人裁決；不自動拿舊圖。**

此新分支從 GitHub `main` 隔離開立，只提交 U03 治理契約與守門工具；**不宣稱 main 原先舊畫面現在就是 U03**。任何正式整合必須另行人工 review 與測試。

## U03 實際美術進度

本 U03 manifest 現在 **0 件透過同源原生母件＋創辦人美術核准雙證明**。這不代表 U03 其他 Library／Notion 美術成果為零，而是本分支**尚未取得可完整核對的授權原生物件**。不得把舊版 W2 22 張 PNG 當作 U03 已完成。

## 檢查

```sh
python universe/U03/tools/LOOPER-U03__VERSION_GATE.py --mode structure
python -m unittest discover -s universe/U03/tests -v
python universe/U03/tools/LOOPER-U03__VERSION_GATE.py --mode release
```

正常情況結構檢查 exit 0；release 因真實藝術來源缺乏仍 exit 4。PASS 絕不代表正式美術或 iPhone 實機完成。
