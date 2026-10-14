# AUTH-01A — implementation checkpoint

Source `0e65eccbb878d66daa9be4adcef3246db8ed33bd`; branch `codex/auth-01a-merchant-google-identity`.

The opt-in merchant Google flow reuses existing accounts, identities, invitations, memberships and session provenance. It adds a durable browser/nonce challenge and atomic identity/invite/session/audit writes, with fail-closed credential validation and a minimal Traditional Chinese responsive login UI.

Implementation-stage focused validation: 32 AUTH-01A tests passed; root lint passed. Full regression and Hosted CI evidence are pending at this checkpoint. This document is not a PASS declaration. Final evidence will be packaged with the final SHA, hosted URLs, raw logs and SHA-256 manifest.

No Economy/Gameplay/Forest/Treehouse/Async adapter changes. No real Google OAuth credential, production login claim, Supabase, Native App or PR merge. Full security/rollout boundaries are recorded in AUTH01A_CALL_GRAPH_AND_SECURITY_MODEL.md.
