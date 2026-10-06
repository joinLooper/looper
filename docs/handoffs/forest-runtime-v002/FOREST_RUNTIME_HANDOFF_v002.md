# Forest Runtime Handoff v002

Status: `Forest Runtime Handoff v002 — Passed`

## Runtime baseline

- Logical canvas: `390 × 844`
- Logical density: `1`
- Native @2x: `deferred_source_missing`
- Native @3x: `deferred_source_missing`
- Runtime default: uniform logical 1x
- Approved canopy SHA: `056aab779a03d28d4f1323554ff87bd70b5222a05bf5f827ff922e98d2a1776c`

Central accepted the High-Density Export blocker as P1 Deferred. No interpolated
formal image was created. Three approved fixed props retain native @2x and @3x
candidate files, while the runtime default remains logical for every layer.

## Integrity

- Approved image changes: `0`
- Transform changes from Calibration v001.1: `0`
- Anchor changes: `0`
- Hotspot changes: `0`
- Foreground changes: `0`
- Character changes: `0`
- Hotspot overlap: `0 / 28 pairs`
- Dynamic values baked into runtime images: `false`
- Old canopy, Candidate character, old Player forest, QA annotation routes: `0`

## Characters

Rabbit uses the approved right 3/4 Standing Proxy. Mole uses the approved left
3/4 Standing Proxy. Neither is mirrored or rescaled outside the approved map.
Ear, chest V, sprout, forepaw, long-tail and dialogue-bubble clearance metadata
are retained. Ground shadows are independent runtime slots and are not baked.

## State mapping

- Core tree: idle, first_hint; growth_available and growth_reached reserved.
- Mission: idle, unread, claimable.
- Knowledge: idle, unread, completed.
- Restaurant: locked; future_open reserved.

## Loading and cache

- Initial critical + secondary: `3,642,202` bytes.
- Deferred after entry: `64,510` bytes.
- State-triggered: `16,932` bytes.
- All unique Logical assets: `3,723,644` bytes.
- Warm immutable-cache network estimate: `0` asset bytes, excluding API/state payloads.

Use immutable, content-addressed asset URLs. Keep the manifest versioned and
switch it atomically. A later native-density package may replace only asset
routes while preserving every `layer_id` and logical coordinate.

## Responsive

A–C complete logical recomposition passed. D/E validate ×2/×3 geometry only and
do not declare interpolated assets. F/G preserve the central core canvas and
desktop lateral extension strategy.

## QA

All 20 required checks passed after ZIP integrity was finalized. QA previews are
evidence only and are not referenced by the runtime manifest.

## Decision

`Forest Runtime Handoff v002 — Passed`
