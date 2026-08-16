# Central Review Runtime Wiring Correction R1

Status: `SUPERSEDED BY FINAL P0 MISSION CLAIM WIRING R1`

- Existing branch retained: `codex/wfr-demo-v1-unified-integration-v001`
- Existing Draft PR retained: `#39`
- Correction baseline head: `af82b6fb8da5b45cf87ab9999a0c6e913d5ebb37`
- Passed Asset modifications: 0
- Backend frozen-file modifications: 0
- Merge performed: no

## Runtime corrections

1. Mission completed state no longer renders `claimed_stamp`; no Claim control exists.
2. `MISSION_CLAIM_P0_AUTHORITY_PENDING` is exposed with executable route count zero.
3. Forest and Treehouse Dialogue bubbles use the formal attachment anchors, source offsets, orientation, safe clamp and responsive logical transform.
4. Dialogue close and continue controls use the formal assets.
5. Restaurant notice is attached to `forest_restaurant_entry_anchor` at `208,420,166,60`; browser-center positioning is zero.
6. Core Tree uses Passed Growth empty/progress/receiving/reduced-motion layers and backend-confirmed values; no emoji or generic summary card remains.
7. Global HUD Settings uses Passed idle/focus/pressed/reduced-motion assets within the single Global HUD family.
8. Settings root and Logout states use formal assets. Logout follows `SETTINGS_OPEN → LOGOUT_CONFIRM → LOGOUT_PROCESSING → SUCCESS/FAILURE`, with Cancel and Retry paths.

## Authority gate resolution

Central released both former gates. The existing integration branch was fast-forwarded to exact approved backend authority commit `d8c332c30578a628dc7d8f544a6c0a9cb527c30e`.

- `backend_alignment_authority_status = PASSED`
- `mission_product_authority_status = FROZEN`
- `mission_backend_binding_status = PASSED`
- `mission_claim_p0_executable_route_count = 1`

The completed-only presentation described above remains the historical Correction R1 state. Current executable behavior and evidence are recorded in `FINAL_P0_MISSION_CLAIM_WIRING_R1.md`.
