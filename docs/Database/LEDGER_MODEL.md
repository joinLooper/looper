# 星星與能量帳本模型

使用者餘額是帳本加總後的衍生值：

```text
balance(user, asset) = SUM(ledger_entries.amount)
```

## 寫入規則

- 每次核銷建立兩筆帳本：star 與 energy。
- 核銷與帳本必須在同一資料庫交易內提交。
- `idempotency_key` 必須唯一。
- 同一 redemption 的同一 asset 只能寫入一次。
- 撤銷時新增負數 reversal，不修改或刪除原紀錄。
- 人工調整使用 `admin_adjustment`，並綁定核准工單。

## 每日對帳

1. 使用者快取餘額與帳本加總比對。
2. redemption 獎勵與 ledger entries 比對。
3. 發現差異時凍結自動補發，建立異常事件。
4. 修復只能新增補正帳本，不可覆寫歷史資料。
