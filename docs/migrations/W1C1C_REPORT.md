# W1C1-C — Player Session & State Async Vertical Slice

**W1C1-C PARTIAL — CENTRAL DECISION REQUIRED**

2026-10-13（Asia/Taipei）。Preflight 已確認現行同步呼叫鏈具有非原子性，依工作包第三、六節停止實作。未建立 AsyncPlayerStateRepository，也未改動 GET /player/state。

## A. Source / Final HEAD

- Source branch：`codex/w1c1-b-async-readonly`
- Source HEAD：`aaa9c74dabf8265f21a60dd0d1e15cb5aa96196a`；本機與 `git ls-remote` 一致。
- 工作分支：`codex/w1c1-c-player-state-async`，直接從指定 Source HEAD 建立。
- 開始時工作樹 CLEAN；原視覺成果保留於原分支。
- 本次僅保存診斷腳本與報告；交付包 `DELIVERY_VERSION.json` 記錄完整 Final HEAD、工作樹與檔案 hash，避免在 commit 自身寫入循環 SHA。
- PR #45：https://github.com/joinLooper/looper/pull/45，核對為 OPEN / Draft，HEAD 仍為 Source HEAD；未修改 #43／#44／#45，未 merge/rebase/force push。

## B. Actual Call Chain

目前仍是 GET /player/state → requirePlayerSession → getPlayerSessionContext → session touch → getUser → applyEnergyRegeneration → mapUser。逐檔副作用、交易邊界、待核准 async 等價方案與測試映射詳見 `W1C1C_PLAYER_STATE_CALL_GRAPH.md`。

既有 AsyncDatabase / AsyncTransaction / bounded pool 存在且未修改；目前只有已核准 mission read-only slice 使用非同步讀取。**本次沒有完成新的 async player state path。**

## C–E. Session / Energy / Transaction 診斷

使用記憶體 SQLite 與真正本機隔離 PostgreSQL 17.11，對每個 backend 執行 5 個 scenario，共 10 個。單一 diagnostic test PASS，不計入 baseline 488 或 async foundation 15，也不是本批功能測試 PASS。

每例用合成 LINE identity、現行 reward fixture 升至 Lv3、Energy=0，時鐘從 03:00 前進至 03:02（現行 regen interval=120 秒）。所有下列資料均為相對於 fixture 的新增／變動。

| 注入點 | HTTP | Session touch 保留 | Energy 增加 | Resource transaction | Energy log | Regen audit |
| --- | --- | --- | --- | --- | --- | --- |
| 不注入 | 200 | 是 | 1 | 1 | 1 | 1 |
| Resource UPDATE 前 | 500 | 是 | 0 | 0 | 0 | 0 |
| Resource transaction INSERT 前 | 500 | 是 | 1 | 0 | 0 | 0 |
| Energy log INSERT 前 | 500 | 是 | 1 | 1 | 0 | 0 |
| Regen audit INSERT 前 | 500 | 是 | 1 | 1 | 1 | 0 |

兩個同步 backend 結果完全一致。Energy 已更新的失敗案例同時推進 energy_last_updated_at；立即重讀雖回傳 200，仍不補回缺少的 ledger/log/audit。Resource UPDATE 前失敗則可在下一次讀取完成 regeneration。所有案例 route 的 Store-level BEGIN/COMMIT 呼叫為 0；PG worker 只保護單一寫入 statement。

原始 token 僅用於記憶體中的 request cookie，未寫入資料庫、輸出 log 或報告。既有 session hashing、purpose/expiry/revocation/account-active 條件均未修改。八類 Session Security、新 async 的全套 Energy matrix、AbortSignal、pool timeout、unknown commit 尚未執行；不得借用既有 foundation 結果宣稱新 slice 通過。

## F. Concurrency

1/5/10/20 並發與 pool 2/4 的新 Player State 驗證未執行，因 async 路徑尚未獲准實作。跨 request 讀寫間隙可能導致競態屬原始碼風險，並非本次實測結論。200 為總註冊帳號目標，沒有 200 concurrent 的容量宣告。

## G–H. Regression / Hosted CI

- 產品檔案 `apps/`、`packages/`、workflow、root package.json、lockfile 相對來源完全無差異；這是 diff 證據，**不等於 regression tests PASS**。
- 本次執行專門的 10-case transaction diagnostic；首次 fixture 誤用 Lv1 max=0，第二次受 SQLite null-prototype row 與 PG plain row 表示差異影響。兩次原始失敗 log 均保留在交付 ZIP；修正只在新增診斷腳本，沿用既有 reward/plain helpers，未修改 baseline assertion。
- install/lint/typecheck/build、baseline 488、foundation 15、load 48、mission read-only 2、本批 async security/parity/concurrency、browser capture 均標記 `NOT_RUN_STOP_GATE`，沒有把上游結果冒充本次驗證。
- 本批未 push／建立新 PR／觸發 Hosted CI；Run ID、URL、Final HEAD CI 均為 null。理由是遵守非原子性 stop gate，不製造尚未完成 slice 的 CI PASS。
- Cookie timing flaky 的原始 assertion／上游歷史不變；本次未重跑 cookie 測試，未宣稱根治。
- 每個新建 PG schema 及其 queue counter 已移除並檢查；fixture 連線關閉。PG runtime 正常 shutdown（server stopped），沒有正式資料或 Supabase 連線。

## I. Files Changed

- `scripts/w1c1c-transaction-boundary.spec.mjs`：可重現、無敏感 token 輸出的同步交易邊界診斷。
- `docs/migrations/W1C1C_PLAYER_STATE_CALL_GRAPH.md`：逐檔 current → side effect → boundary → proposed async → test。
- `docs/migrations/W1C1C_SESSION_ENERGY_PARITY_RESULTS.json`：有限範圍的同步 parity 與未驗證項目。
- `docs/migrations/W1C1C_FAILURE_CONCURRENCY_RESULTS.json`：完整 10-case evidence；並發／async failure gate 狀態。
- `docs/migrations/W1C1C_REGRESSION_RESULTS.json`：本次執行／未執行、產品 diff 範圍。
- `docs/migrations/W1C1C_HOSTED_CI_RESULTS.json`：未觸發 CI 的原因，不填造 Run ID。
- 本報告：停止原因、風險與中央裁決選項。

## J. Central decision / remaining risks

工作包原文：「如原同步 Store 存在非原子性邊界，須明確列出差異並提交中央裁決。不得未經核准改寫其業務語意。」此條件已由實測確認。

**建議核准範圍**：僅 opt-in async GET /player/state 改為單一 transaction，把 Session validation/touch、Energy regeneration、resource/ledger/log/audit 及 snapshot 全部放在既有 advisory writer lock 下。確認的 pre-commit failure 全數 rollback；公式、成功 API response、Stars/EXP/Level/CO₂e/Growth/history 與同步預設路徑不變。這會刻意修正上述 partial-commit 行為，必須由中央核准，不能稱為完全相同的 failure parity。

請中央明確裁決：是否同意這項原子失敗語意修正，以及失敗時 Session touch 是否一併回滾。若要同步 SQLite 也修正，需另行核准範圍；本批沒有自行變更。

核准後才可抽離純 regeneration 計算與 row mapping、實作單一路徑、測試 SQLite/sync PG/async PG 的成功 parity 與已核准 failure differences，並完成所有 regression / Hosted CI / concurrency gates。未知 COMMIT 結果仍禁止盲目重送，不能使用隨機 source ID 當作可安全 retry 的依據。

## K. Stop

**W1C1-C PARTIAL — CENTRAL DECISION REQUIRED**。
沒有 Gameplay/Economy/Settlement、美術、Supabase、Production migration、Native App 修改。停止於中央交易邊界裁決；沒有開始下一批。
