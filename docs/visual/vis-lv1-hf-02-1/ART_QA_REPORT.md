# VIS-LV1-HF-02.1｜角色一致性與電影感介面精修

最終狀態：**FILM_3D_REFERENCE_REQUIRED**

手機介面與比例修正已完成。角色、電影渲染校準仍待最新核准前導片 3D 角色參考，不宣告 Final Art。

## 來源與工作範圍

- 來源分支：`codex/vis-lv1-hf-02-canon-v2`
- 來源 HEAD：`d2d9ab6344d9854ef0ec029f2a71862af6754e56`
- 沿用 Draft PR #47：https://github.com/joinLooper/looper/pull/47
- 本輪僅新增此視覺審查包，並更正上一版報告將坐姿誤稱為核准 idle 的文字。
- `scene.png` 與 HF-02 無 UI PNG 的 SHA-256 完全相同：`c3923bd85355f076df284eb65c68820ce904767d85c45e3a220f5248d1f6e654`。
- 沒有使用影像生成工具重新生成角色；沒有第四版外型，沒有重新設計森林。

## 最新前導片參考缺口

搜尋 repository 的文件與資產，以及 Downloads 中與 Looper／film／trailer／前導片相關的檔名。找到 Birthday Film review 影片、多版 ZIP 與 APPROVED 分鏡 ZIP，但沒有可將特定檔案確定為「最新核准 3D 角色外觀」的核准版本、畫格或 hash。檔名不足以建立版本權威，未將這些候選檔案用作外觀依據。

所缺素材：**最新核准前導片 3D 角色參考的實際路徑／可讀連結，以及核准版本或指定畫格**。現有渲染、瀏覽器與 PNG 讀取工具可用，不是工具缺失。

10/06 的三張 Canon 原圖重新驗證成功，3/3 SHA-256、尺寸與 MANIFEST 一致，亦已實際開啟。`BROWSER_QA.json` 保存檔名與 hash。原圖未加入 Git；本機對照圖位於 gitignored `output/vis-lv1-hf-02-1/private-canon-comparison.png`。可使用 `canon-review.html` 選取三張本機原圖重新對照；此頁不會上傳檔案。

## 角色逐項審查

以下是人工視覺觀察，不是自動化 fidelity 通過證明。

| 項目 | HF-02 候選畫面的觀察 | 本輪處置／狀態 |
| --- | --- | --- |
| 臉部與眼睛比例 | 保留大眼、圓臉與淡色口鼻區；三分之四候選角度與正面 Canon 無法直接量比，尚未證實與電影角色一致 | 不改外型；待 3D 參考 |
| 眉毛、鼻子、嘴部 | 深色弧眉、圓鼻、微笑及門牙可辨識；鼻部體積與嘴角輪廓需要同角度電影參考判斷 | 不宣告封版 |
| 臉頰輪廓與毛流 | 候選臉頰較集中、毛束較密且細；Canon 的鬍鬚與臉頰輪廓更具手繪特徵 | 材質融合待校準 |
| 領巾形狀與結的位置 | 候選結落在畫面左側；原圖正面與不同側面結的位置需按朝向核對，不能直接鏡像或宣稱相同 | 列為中央核對重點 |
| 坐姿體態與四肢 | 候選腳掌朝前、坐地姿勢不等於原圖的站姿 idle | **CANDIDATE_POSE；不是核准 Final Idle** |
| 尾巴尺寸 | 候選尾巴可見於左後側，但坐姿遮擋造成投影不同；不能以目前投影確認標準尺寸 | 待核准姿態與 3D 參考 |
| 頭頂嫩芽 | 雙葉嫩芽存在；葉片張角及莖長仍須同角度核對 | 保留，未重新生成 |

## 森林與畫面

完整沿用原圖的晨光、空氣透視、前景柔焦及三個錨點。黃綠高光、背景葉片密度、臉部光線、接地陰影與材質融合本輪**未進行像素修改**；這些美術項目仍待電影參考後統一校準。不得把介面檢查通過解讀為電影質感通過。

長手機只以同一張圖片延展上方 34% 的樹冠顯示區；下方場景與角色按原始 941:1672 比例顯示，沒有新增水平裁切或角色拉伸。這是可重現的預覽排版處理，並非新增場景美術。上方樹冠的縱向伸展是否可接受仍交中央視覺審核。左側樹樁原本就貼近原圖邊緣，本輪沒有再裁切它。

## 介面與驗證

- 不再常駐大型白色圓環；保留三個小型繁體中文錨點標記及透明觸控區。
- 各觸控區至少 48×48 CSS px，互不重疊，與來源圖片座標共同縮放。
- 點擊後僅標記輕移／微亮與淺色短提示，3.6 秒自動消退。鍵盤可 Tab／Enter 操作，焦點邊框僅在鍵盤操作時出現。
- 全部目前介面標題、提示、標籤及無障礙文案為繁體中文；比較圖左側保留歷史版本的原樣文案。
- 安全區使用 `env(safe-area-inset-*)`；瀏覽器以 47px 頂部、34px 底部進行 CSS 模擬，尚未宣稱實機安全區驗收。
- `prefers-reduced-motion` 下無動畫與過場，靜態森林及操作仍成立。

| 驗證 | 結果 |
| --- | --- |
| 360×640，9:16 | PASS：滿高、無上下深色留邊、原始場景比例不變 |
| 390×845，9:19.5 | PASS：滿高、無上下深色留邊、三個焦點可見 |
| 各比例三個觸控點及顯示訊息 | PASS：6/6 |
| 觸控尺寸／命中測試／無水平溢出 | PASS |
| 鍵盤操作／提示自動關閉／減少動態 | PASS |
| PNG、Canon hash／尺寸／瀏覽器頁面錯誤 | PASS：3/3 Canon，0 頁面錯誤 |
| Character fidelity／電影渲染／坐姿核准 | HOLD：FILM_3D_REFERENCE_REQUIRED |

重現：在 repository 根目錄執行 `node docs/visual/vis-lv1-hf-02-1/capture.mjs`。可設定 `LOOPER_CAPTURE_BROWSER_EXECUTABLE` 指向可用瀏覽器；提供 `LOOPER_CANON_REFERENCE_DIR` 才會生成私人原圖對照圖。瀏覽器截圖直接輸出實際 HTML，HUD 沒有另行生成不同場景。

## 交付檔案

1. `scene.png`：同構圖無 UI 原圖，明確標示沿用。
2. `hud.png`：同場景實際 HTML HUD 截圖。
3. `index.html`：可直接打開的手機互動頁。
4. `phone-9x16*.png`、`phone-9x19_5*.png`：各比例靜態、點擊與減少動態截圖。
5. `canon-review.html` + 本機 `output/vis-lv1-hf-02-1/private-canon-comparison.png`：角色對照，含原圖的 PNG 不公開。
6. `comparison.html`、`hf02-vs-hf02_1.png`：HF-02 與本輪前後對比。
7. 本報告、`BROWSER_QA.json`、`DELIVERY_MANIFEST.json`、`capture.mjs`：審查、hash 及可重現證據。

Gameplay、Economy、Lv1 Scene State、資料庫、Supabase、Native App、工程線均不變。PR #47 保持 Draft / Unmerged。停止於中央人工視覺驗收。
