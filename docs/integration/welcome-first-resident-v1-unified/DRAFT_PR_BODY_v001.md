## Welcome First Resident Demo v1.0 — Unified Codex Integration v001

Central handoff status: `CORRECTION_R1_IMPLEMENTED_AWAITING_AUTHORITY_GATES`

### Central Review Runtime Wiring Correction R1

- Removed unconditional Mission claimed stamp; completed is not treated as claimed
- Added `MISSION_CLAIM_P0_AUTHORITY_PENDING`; Claim executable route = 0
- Bound Dialogue bubbles to the four formal character anchors with formal close/continue controls
- Bound Restaurant construction notice to `forest_restaurant_entry_anchor` and logical rect `208,420,166,60`
- Replaced Core Tree emoji/card with Passed Growth world-state layers
- Bound Global HUD Settings idle/focus/pressed/reduced-motion assets
- Bound Settings formal state layers and Logout Confirm/Cancel/Processing/Failure/Retry flow
- Kept migration v25 and all Knowledge backend alignment bytes frozen for `PENDING_CENTRAL_BACKEND_REVIEW`

### Authority

- Baseline: `55abfee7d8f65c72e30e9ab5f85519a27230bad4`
- Unified Source Gate: 9/9 formal runtime packages verified and bound
- Passed assets/Canon/baseline unchanged

### Integration

- Unified resident runtime with one Global HUD and one Global Focus Manager
- Forest, Treehouse, Dialogue, Mission, Knowledge, Settings, Resources, Reward destinations, and Restaurant construction authority integrated
- Backend-authoritative Knowledge daily rewards and P0 authenticated-session Mission read model
- UG-01 through UG-14 P0 guards enforced
- Legacy Bottom Navigation, proxy characters, reward cards, Merchant Mission P0, Restaurant transaction, and P1 executable routes excluded

### Verification

- `pnpm test`: 302/302
- `pnpm lint`: 9/9
- `pnpm typecheck`: 9/9
- `pnpm build`: 9/9
- Unified and compatibility static QA: PASS
- Browser and responsive A–G QA: PASS
- Critical console errors: 0

### Release blockers

- Reduced Motion durable persistence authority pending
- Customer Support destination pending
- Mission Claim P0 authority pending
- Central Backend alignment review pending

This PR is intentionally Draft. Do not merge before Central Review approval.
