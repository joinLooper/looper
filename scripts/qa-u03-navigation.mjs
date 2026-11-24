/**
 * LOOPER-U03 Forest Lv1 navigation source audit.
 * Read-only: this script never mutates a player account, deployment, or image.
 * A blocked result is expected for the archived 2026-08-24 player shell.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const required = Object.freeze([
  'ui_icon_nav_forest',
  'ui_icon_nav_mission',
  'ui_icon_nav_exchange',
  'ui_icon_nav_settings',
]);
const paths = Object.freeze({
  hud: 'apps/web/app/game-runtime/global-hud.tsx',
  forest: 'apps/web/app/forest-logical-runtime.tsx',
  resident: 'apps/web/app/game-runtime/resident-game.tsx',
  assets: 'apps/web/app/game-runtime/asset-routes.ts',
  overlays: 'apps/web/app/game-runtime/primary-overlay.tsx',
  legacyQa: 'scripts/qa-unified-runtime.mjs',
});

function audit(sources) {
  const hud = sources.hud ?? '';
  const forest = sources.forest ?? '';
  const resident = sources.resident ?? '';
  const assets = sources.assets ?? '';
  const overlays = sources.overlays ?? '';
  const nav = sources.nav ?? '';
  const legacyQa = sources.legacyQa ?? '';
  const countMatch = assets.match(/bottomNavigation:\s*(\d+)/);
  const registeredBottomCount = countMatch ? Number(countMatch[1]) : null;
  const globalHudSettings = /global-game-hud__settings\s+ui-control/.test(hud) && /onClick=\{onOpenSettings\}/.test(hud);
  const forestSettingsHotspot = /hotspot_settings:\s*onOpenSettings/.test(forest);
  const forestSettingsLayer = /forest_settings_entry/.test(forest);
  const navUiIds = required.filter((name) => nav.includes(name));
  const bottomNavMounted = /<\s*(?:U03BottomNav|BottomNavigation|GlobalBottomNav)\b/.test(resident);
  const bottomNavHasFourAssets = navUiIds.length === required.length;
  const bottomNavRegistered = registeredBottomCount === required.length;
  const legacyQaForcesZero = /bottomNavigation:\s*\\s\*0/.test(legacyQa);
  const canonicalSettingsOverlay = /<SettingsOverlay\b/.test(resident) && /export function SettingsOverlay\(/.test(overlays);
  const hasWorldState = /const \[scene, setScene\]/.test(resident) && /transitionScene\(/.test(resident);
  const checks = {
    correctBottomNavAssetIds: bottomNavHasFourAssets,
    registeredBottomNavCount: bottomNavRegistered,
    bottomNavMounted,
    oldGlobalHudSettingsRemoved: !globalHudSettings,
    oldForestSettingsHotspotRemoved: !forestSettingsHotspot,
    oldForestSettingsVisualRemoved: !forestSettingsLayer,
    oldZeroCountTestRetired: !legacyQaForcesZero,
    existingSettingsOverlayRetained: canonicalSettingsOverlay,
    sceneStatePreserved: hasWorldState,
  };
  const reasons = {
    correctBottomNavAssetIds: '缺少底部四個已核准的原有 ui_icon_nav_* 素材身分',
    registeredBottomNavCount: '正式 runtime 的底部導覽數量不是 4',
    bottomNavMounted: '玩家端未掛載同一組正式底部導覽',
    oldGlobalHudSettingsRemoved: '頂部 HUD 仍有重複的設定按鈕',
    oldForestSettingsHotspotRemoved: 'Forest 仍保留右上設定點擊熱區',
    oldForestSettingsVisualRemoved: 'Forest 仍保留舊右上選單視覺層來源',
    oldZeroCountTestRetired: '既有舊版 QA 仍要求 bottomNavigation = 0',
    existingSettingsOverlayRetained: '原有 SettingsOverlay 必須繼續提供已存在的設定功能',
    sceneStatePreserved: 'Forest/Treehouse 原場景狀態切換功能尚需保留',
  };
  const blockers = Object.entries(checks).filter(([, passed]) => !passed).map(([id]) => ({ id, detail: reasons[id] }));
  return {
    audit: 'LOOPER-U03_FOREST_LV1_NAVIGATION',
    approved: 'BOTTOM_FOUR_ONLY_2026-11-24',
    checked: {
      registeredBottomCount,
      foundApprovedNavAssetIds: navUiIds,
      oldGlobalHudSettings: globalHudSettings,
      oldForestSettingsHotspot: forestSettingsHotspot,
      oldForestSettingsLayer: forestSettingsLayer,
      legacyQaForcesZero,
    },
    checks,
    blockers,
    status: blockers.length ? 'BLOCKED_NOT_U03_NAVIGATION' : 'STATIC_CONTRACT_READY_RUNTIME_AND_DEVICE_QA_REQUIRED',
    artFinal: 'NOT_ASSESSED',
    deviceQa: 'NOT_RUN',
  };
}

function readSources() {
  const result = {};
  for (const [name, path] of Object.entries(paths)) {
    const full = join(root, path);
    if (!existsSync(full)) throw new Error('缺少必要來源檔：' + path);
    result[name] = readFileSync(full, 'utf8');
  }
  const runtimeDir = join(root, 'apps/web/app/game-runtime');
  result.nav = readdirSync(runtimeDir)
    .filter((name) => /\.(?:tsx|ts)$/.test(name))
    .map((name) => readFileSync(join(runtimeDir, name), 'utf8'))
    .join('\n');
  return result;
}

function selfTest() {
  const blocked = audit({
    hud: '<button className="global-game-hud__settings ui-control" onClick={onOpenSettings}/>',
    forest: 'forest_settings_entry hotspot_settings: onOpenSettings',
    resident: 'const [scene, setScene] = useState(); transitionScene(); <SettingsOverlay/>',
    assets: 'bottomNavigation: 0',
    legacyQa: 'assert.match(routes, /bottomNavigation:\\s*0/);',
    overlays: 'export function SettingsOverlay()',
    nav: '',
  });
  assert.equal(blocked.status, 'BLOCKED_NOT_U03_NAVIGATION');
  assert.ok(blocked.blockers.length >= 6);
  const ready = audit({
    hud: '<div className="global-game-hud">Lv / EXP / stars</div>',
    forest: 'const forest = true;',
    resident: 'const [scene, setScene] = useState(); transitionScene(); <SettingsOverlay/><U03BottomNav/>',
    assets: 'bottomNavigation: 4',
    legacyQa: 'assert.match(routes, /bottomNavigation:\\s*4/);',
    overlays: 'export function SettingsOverlay()',
    nav: required.join(' '),
  });
  assert.equal(ready.status, 'STATIC_CONTRACT_READY_RUNTIME_AND_DEVICE_QA_REQUIRED');
  assert.deepEqual(ready.blockers, []);
  process.stdout.write('U03_NAV_AUDIT_SELF_TEST_PASS (blocked and statically-ready fixtures)\n');
}

const args = new Set(process.argv.slice(2));
if (args.has('--self-test')) selfTest();
else {
  const result = audit(readSources());
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (args.has('--expect-blocked')) {
    if (!result.blockers.length) process.exitCode = 1;
  } else if (result.blockers.length) {
    process.exitCode = 4;
  }
}
