# Codex Forest Integration Contract

Status: `Approved for Logical Runtime integration`

1. Codex 不得自行改位置；`forest_transform_map.v2.json` 的 x、y、scale、pivot、z-index 與 visibility 為唯一正式值。
2. Codex 不得自行重做 UI。
3. Codex 不得使用舊 Player 森林。
4. Codex 不得把場景做回大型按鈕頁。
5. Codex 不得將 LV、EXP、進度、星星、任務、知識、成長、施工或未讀狀態烙入圖片。
6. Codex 不得重新生成、鏡像、裁切或改比例兔兔與土撥鼠。
7. 原生 @2x／@3x 缺失已列 P1 Deferred，不阻擋 Logical Runtime 接入。
8. 未來高解析資產必須保持相同 `layer_id` 與 logical metadata，只可替換 density route。
9. Runtime 預設一律使用 `logical_1x_uniform`，不得因三個小物件有原生高密度檔而混用場景縮放規則。
10. 前景層不得攔截 pointer events；Hotspot 必須使用 Map 轉換後座標。
11. 角色、接地陰影、對話泡泡均為獨立 slot；陰影不得烙入角色 PNG。
12. Desktop 使用中央核心畫布與左右延伸背景策略；不得橫向硬拉 Mobile 場景。

Reserved state 在正式素材到位前只保留狀態名稱與空 route，不得自行繪製替代圖。
