# Knowledge Book R2 + R3 — B lane QA evidence

Date: 2026-10-25 (Asia/Taipei). Issue #67 / Draft PR #68.

Status: **isolated playable QA implemented; real Expo Web PASS; source art blocked; iPhone NOT RUN**. No merge, production deployment or player-ledger transaction.

## Branch and ownership

- Worktree: `C:\Users\deyi2\OneDrive\文件\ChatGPT\looper-knowledge-r2r3`.
- Local branch: `codex/knowledge-book-r2-r3-local`; delivery branch: `codex/knowledge-book-r2-r3-qa-isolated-01`.
- Started at B commit `623e17a74c96d527cab8539d0c98876e8895bd84`, descended from common PR #65 base `9c1da86c84af777d2a346215faf2a76bdbbd2b59`. PR #61–#66 handoffs were inspected. No A merge/cherry-pick.
- All tracked changes pass `knowledge-book-scope-check.mjs`. Forest, shared state/model, existing knowledge route, package/lockfiles, API, CI and original assets are unchanged.
- Canonical Lv3 entitlement checked against `apps/api/src/economy.ts`: level 3 unlocks `knowledge_entry`; the QA route reads the App level and uses separate local Lv1/Lv3 fixtures. It does not dispatch into the shared model.

## Actual route and behavior

Local preview: **http://127.0.0.1:8099/knowledge-book-qa**. This is this Windows machine's localhost, not a published or iPhone-accessible URL.

Route: `/knowledge-book-qa` → local Lv3 fixture → book intro → question → select → confirm → correct/incorrect + explanation → completed → next → second question → third-question `ENERGY_POLICY_PENDING`. Close returns to the isolated book intro; **返回 Forest** navigates to `/forest`. The shared Forest hotspot has not been connected by B.

The route is available in DEV or with exact explicit `EXPO_PUBLIC_ENABLE_KNOWLEDGE_BOOK_QA=1`; the default release redirects to Forest. The verified export uses the explicit QA opt-in. Production gate behavior is unit-tested, not claimed as a separately exported release E2E run.

Question/options/answer/explanation/count/Knowledge/energy notice are program text. Knowledge is `—`; no invented resource or reward appears. Two unique answers count at submission, repeated submission/review does not count again. The third question has no submit action and no inferred energy cost or daily maximum. Memory survives route subscriptions/remounts within a running bundle; full page reload intentionally starts a new QA session. Taipei day rollover resets the QA session. These are QA counts, not an official daily ledger.

## Executed checks

| Check | Result |
| --- | --- |
| Existing mobile `tsc --noEmit` | PASS |
| New state/gate/store/boundary tests | 14/14 PASS |
| SHA/CRC/path/budget importer safety tests | 5/5 PASS |
| Existing complete mobile test command | 66 PASS, 0 FAIL, 1 SKIP (67 total) |
| Skipped existing Python syntax check | Missing Windows `py` launcher; identical AST parse separately PASS using bundled Python |
| Changed-file whitelist / diff format | PASS |
| Real Expo Web export | PASS, 821 modules, 39 existing assets |
| Browser 360×640 / 390×845 | Both PASS, 17 measured taps each, return to Forest PASS |
| Browser page errors / failed asset responses / player API requests | 0 / 0 / 0 at both ratios |
| iPhone native gestures / safe-area / visual signoff | NOT RUN, independently pending |

The state tests include question 1 correct, question 2 wrong, question 3 paused; repeated taps/submit/complete/next; reopening the same question; invalid selection; Lv1/Lv3; same-day retention and Taipei midnight. The importer tests use synthetic archives only; they do not prove the private R2/R3 package was received.

The browser tests measure minimum option height 56px and action height 48px, horizontal bounds, and no document overflow. Content reflows vertically and scrolls; it does not squeeze the 1120×760 candidate into a portrait viewport. Browser safe-area checks do not substitute for physical iPhone verification.

## Five independent state results and screenshots

All screenshots are actual running Expo Web screenshots. No composites. **Private/local QA PNGs are not committed to GitHub.**

Local evidence directory: `output/knowledge-book-browser/verified/` in the B worktree. It contains 20 PNGs, `browser-evidence.json`, and each screenshot's SHA-256. `output/knowledge-book-browser/viewport/browser-evidence.json` records the additional exact layout-viewport assertions.

| State | 9:16 screenshot | 9:19.5 screenshot | Web interaction | R2/R3 art / iPhone |
| --- | --- | --- | --- | --- |
| unanswered | `9x16-unanswered.png` | `9x19_5-unanswered.png` | PASS | BLOCKED / NOT RUN |
| selected | `9x16-selected.png` | `9x19_5-selected.png` | PASS | BLOCKED / NOT RUN |
| correct | `9x16-correct.png` | `9x19_5-correct.png` | PASS | BLOCKED / NOT RUN |
| incorrect | `9x16-incorrect.png` | `9x19_5-incorrect.png` | PASS | BLOCKED / NOT RUN |
| completed | `9x16-completed.png` | `9x19_5-completed.png` | PASS | BLOCKED / NOT RUN |

Each ratio also has intro, Lv1 lock, correct/wrong explanation and energy-policy-pending captures. The 9:16 paper extends below the fold by design; all options/actions are reachable by scrolling and were tapped by the test.

## Build provenance

Windows Expo cannot export assets when its C-drive source uses real dependency files on D: asset filenames contain a drive colon. The B-only `knowledge-book-export.mjs` creates a fresh same-drive build mirror, copies App source unchanged, verifies all 58 source/asset SHA-256 values, and excludes old output/stores from Metro. It never edits the dependency workspace. The shared Metro config was not modified.

- Verified mirror: `D:\Looper-Knowledge-B-runtime\b-1792898279910-7924`.
- Full source fingerprint audit: B `output/knowledge-book-browser/build.json`.
- Bundle: `entry-4c2f290dadc2609b1962b35b358ea735.js`.
- Bundle SHA-256: `694bd8e12082cb9550bb49d3b399c4455b6cc8e174fe5f7bb299b02e72f2a56e`.
- HTML SHA-256: `bea5d528453a186a83cc91bfb5533532ee5413dbc16e63162fa312d5468269f2`.

Existing D dependency versions match B's mobile manifest. The incomplete fresh B dependency install was stopped and retained only under ignored local output; no dependency policy/lockfile was changed, and no Puppeteer browser download was enabled. Browser QA uses installed Chrome.

## Source/art and energy blockers

1. **ART_BLOCKED_NATIVE_BOOK_LAYERS_MISSING / SOURCE_BYTES_UNAVAILABLE.** The specified Library handoff was not obtained as original bytes in this Windows run. The only similarly named local download was an unrelated older modular ZIP and was not substituted. Expected combined SHA: `21636c0a0115ecb1107b7817aafa30e013b17c6341bc1dded51b02c623a60d72`; expected engineering handoff SHA: `39b5617d7cd3d5ddb96a928cf5c20a2344c2f4ef087757edf963800419806dfa`. The pinned importer rejects other SHAs, verifies recursive CRC and independent R2/R3 package fingerprints, and saves original bytes only to local output. R2 is the book/paper/placement foundation. R3 supplies reference pixels/five paper states/food-waste visible pixels/OpenRaster paper; it does not supply the genuine layered book master. No source CRC, actual candidate pixel/placement match or native book layers are claimed verified. Runtime currently uses program layout plus the pre-existing closed-book entry image. The food-waste slot appears only on its example question, visibly pending. No new Asset IDs or Asset Register were created.
2. **ENERGY_POLICY_PENDING.** Questions 1–2 are free; question 3 has no answer submit or economy client. Cost and daily maximum remain null. The old answer reward constant is not used as a charge. No player answer POST, reward receipt, EXP, stars or energy write occurs.

Final Art / Asset Ready / formal runtime / all five iPhone visual states remain unapproved.

## INTEGRATION_HOOK_REQUEST — Central only, not applied

After A freezes `forest.tsx`, Central can add the following import and replace only the existing `stump-hotspot` callback. Preserve the existing `knowledgeAllowed` wrapper and all images/geometry. This proposal routes existing QA Lv3 fixtures only; the normal player callback stays as it is.

```tsx
import { qaEnabled } from "../src/knowledge-book/flow";

// Proposed replacement for the current onPress={() => open("knowledge")}:
onPress={() => {
  if (state.qaPreview && state.level >= 3 && qaEnabled(
    typeof __DEV__ !== "undefined" && __DEV__,
    process.env.EXPO_PUBLIC_ENABLE_KNOWLEDGE_BOOK_QA,
  )) {
    router.push("/knowledge-book-qa");
    return;
  }
  open("knowledge");
}}
```

Expected test IDs: `stump-hotspot` → `kb-intro` → `kb-open` → `kb-option-0..3` → `kb-submit` → `kb-explanation` → `kb-complete` → `kb-next` → `kb-policy-pending`; `kb-close` and `kb-return-forest`. Verify default release callback unchanged, QA Lv1 remains locked, QA Lv3 reaches B, return restores Forest and no ledger request occurs. Central must run the shared Forest tests after this one serialized patch. **B has not made this shared-file change.**
