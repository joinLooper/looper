# LOOPER｜F1-WEB-EXPORT-DEPENDENCY-POLICY-01
2026-10-24｜中央主控 03｜Windows safe integration
Status: GitHub Draft implementation; **not yet applied to Windows dirty worktree**.

## Blocker and authority
Windows Codex reported:
- Approved Forest image SHA-256 `32021bd41d33f1b54197c3c171648f2ff0de696eb79c5b38d5a0ba8a0072f2d5`.
- QA-only HUD PNG SHA-256 `1f7a554640cd6137fde7d45193f6960d41f3a931b6ce85684364bf7a403a5ea1`.
- Local `pnpm --filter @looper/mobile build:web` invoked dependency preflight and stopped for the unreviewed `puppeteer@24.37.5` install script; directly invoked Expo export had not yet completed.
- No new Web screenshots, Metro source identity or iPhone acceptance. Gate A/R and local 32/32 tests are **separate** and remain as reported.

The repository pins `pnpm@10.13.1` whereas its original `pnpm-workspace.yaml` uses `allowBuilds`, a setting added in newer 10.x releases. The repair keeps the positive approvals for `esbuild` and `sharp`, explicitly denies Puppeteer builds, and adds the legacy equivalents:
```yaml
allowBuilds:
  esbuild: true
  sharp: true
  puppeteer: false
onlyBuiltDependencies:
  - esbuild
  - sharp
ignoredBuiltDependencies:
  - puppeteer
```
No policy allows all scripts; the Puppeteer package JavaScript may be loaded for QA without invoking its installation-time browser download.

## Windows execution — no repo reset and no install during first pass
1. Preserve the existing dirty worktree, already verified Forest background, HUD non-null generated mapping and all prior PR64 changes. Review the source diff for `pnpm-workspace.yaml`, `apps/mobile/scripts/export-web-existing-deps.mjs`, `apps/mobile/tests/f1-pnpm-export-policy.test.ts` and `scripts/w203-mobile-web-qa.mjs` on PR #64. **Merge just the required snippets**, not the whole repository, and never overwrite `forest.tsx`.
2. Confirm `node --version`, `pnpm --version` and that `apps/mobile/node_modules/expo/bin/cli` exists. If missing, stop with `EXPO_NOT_INSTALLED` instead of silently authorizing scripts or changing package versions.
3. From `D:\Looper-INTEGRATION01`, run:
   ```powershell
   node .\apps\mobile\scripts\export-web-existing-deps.mjs
   ```
   This calls the **installed Expo CLI directly**, caps Metro workers at 2, runs standard Web export, and then runs the existing `ensure-single-web-viewport.mjs` on `apps/mobile/dist/index.html`. Verify exit code 0 and recorded HTML SHA. The script does not invoke `pnpm install`, `pnpm exec`, Puppeteer browser download, or `pnpm approve-builds`.
4. Only if the Web export succeeds, run browser QA **from repository root**:
   ```powershell
   node .\scripts\w203-mobile-web-qa.mjs
   ```
   On Windows this resolves an installed Chrome/Edge executable or a user-provided `PUPPETEER_EXECUTABLE_PATH`, without Puppeteer postinstall. Output goes to `output/w203-mobile-web/`, including `9x16-forest.png`, `9x19_5-forest.png`, interaction screenshots and machine-readable result. It must exit 0 to count as Windows Web PASS. Do not call the previous GitHub Cloud Web screenshots evidence of the local approved art.
5. Once the same local source is verified, launch a fresh Metro instance without reinstalling dependencies:
   ```powershell
   cd D:\Looper-INTEGRATION01\apps\mobile
   node .\node_modules\expo\bin\cli start --host lan --port 8086
   ```
   Check that port 8086 belongs to the intended Expo process, record `git rev-parse HEAD`, `git status --short` and a SHA-256 for current `forest.tsx` and generated HUD import. Since HEAD may not change for uncommitted changes, the source SHA, not Git HEAD alone, establishes the real QA identity. Record the LAN QR, never assume an old QR is a fresh bundle.
6. Physical iPhone: capture Lv1 Forest with approved waterfall background and two-row QA HUD, Lv3, Lv5 and Lv10 as available, and each applicable object's tap → screen → close → return. Explicitly test Forest Settings → Return Welcome → Re-enter Forest. Do not infer Native/iPhone acceptance from Web PASS.

## Failure classification
- `ERR_PNPM_IGNORED_BUILDS`: verify selected pnpm version and **explicit Puppeteer denial**; do not allow all scripts.
- `EXPO_NOT_INSTALLED`: no pre-existing CLI: stop; decide an isolated, policy-compliant install later, never silently self-install.
- `EXPO_EXPORT_FAILED`: analyze real Metro error/log and dependencies; do not call it Puppeteer failure without evidence.
- Web screenshot QA fails because Chrome is missing: set `PUPPETEER_EXECUTABLE_PATH` to verified local Chrome/Edge; don't enable Puppeteer postinstall.
- Expo export success alone is **not** QA PASS: need 9:16/9:19.5 screenshots.
- GitHub CI success without source PNG/HUD is **not** approval of the Windows version.

## Guardrails
Maintain Draft PR #64; do not merge, rebase, reset, clean, deploy, grant backend credentials, modify economy/ledger, rewrite approved PNGs, or promote HUD candidate to Final.
