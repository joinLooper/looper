# AUTH-01A Web Preview QA

PASS: 24 cases, 8 states × Desktop 1280×900 / Mobile 360×640 (9:16) / Mobile 360×780 (9:19.5).

States: invitation validated, returning login, success, expired invitation, account conflict, permission denied, network failure/retry, unknown commit outcome (no retry). Tests require no horizontal/vertical overflow, Traditional Chinese document language, buttons at least 44px tall, no page errors and removal of the invitation token from the URL. Network retry is exercised. PNGs retain exact viewport dimensions; the QA label is fixed-position and does not add layout height.

The actual product GoogleLogin React component and merchant CSS are bundled unchanged into the preview. Google SDK and API responses are explicitly synthetic. Screenshots and preview are **not evidence of real Google OAuth consent, credentials, provider rendering or device integration**. The backend separately verifies real cryptographic signatures against ephemeral local JWKS fixtures in SQLite/PG tests.

Manual inspection performed: desktop success, 9:16 conflict, 9:19.5 invitation. Clear text and light card layout; no Forest/character assets changed. React Best Practices review covered conditional third-party loading, cancellation on unmount/retry, stable component state, accessible status live region, and local-only invitation token retention.

Raw results: web-preview/results.json. Interactive isolated preview: web-preview/preview.html?case=invite&token=ttttttttttttttttttttttttttttttttttttttttttt (use START_HERE links).
