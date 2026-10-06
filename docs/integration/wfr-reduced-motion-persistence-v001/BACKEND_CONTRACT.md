# Reduced Motion Durable Persistence Backend Contract v001

## Storage

The authenticated resident's explicit reduced-motion override is stored on `users` by migration v27.

- `reduced_motion = NULL`: no explicit account override
- `reduced_motion = 0`: explicit OFF
- `reduced_motion = 1`: explicit ON
- `reduced_motion_updated_at`: timestamp of the last successful explicit write, otherwise `NULL`

Existing and newly created residents remain `NULL` until they explicitly toggle the setting. Browser or operating-system preferences are presentation fallbacks only and are never written as durable account truth.

## API

`GET /player/preferences/presentation`

Requires the player session cookie and returns:

```json
{
  "reducedMotion": null,
  "updatedAt": null
}
```

`POST /player/preferences/presentation`

Requires the player session cookie, the configured player origin, and exactly this request body:

```json
{
  "reducedMotion": true
}
```

Resident, account, device, and session identifiers are rejected. Identity is derived exclusively from the authenticated player session. The write is atomic and last successful write wins.

## Failure semantics

A failed write rolls back completely. The client may keep the selected presentation value for the current in-memory session, but must expose it as not persisted. Reload, relogin, a new browser, and another device read backend truth.

This preference changes presentation only. It does not participate in Mission, Reward Ledger, Stars, EXP, Energy, CO2e, Knowledge, growth, or merchant authority.
