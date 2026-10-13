# W1C1-D Approved Synchronous Atomicity Delta

Central authorization: legacy partial commit is a defect. Both SQLite and synchronous PostgreSQL must change to atomic rollback. Source `6333b4c27a19bea0493c9d5327aedb160d0ddb72`; upstream Async behavior remains unchanged.

| Failure point | Observed source behavior | Approved behavior |
| --- | --- | --- |
| Session touch fails | No later writes; prior work may be outside scope | No writes from this operation |
| After Session touch / before Energy update | Session timestamps remain changed | Session timestamps roll back |
| After Energy update / before resource ledger | Energy and regeneration timestamp remain changed | Session and resources roll back |
| Before Energy Log | Session, resources and ledger remain | All roll back |
| Before Audit | Session, resources, ledger and Energy Log remain | All roll back |
| Snapshot mapping fails before commit | Earlier writes already committed | All writes in this state operation roll back |
| Inside existing caller transaction | Caller owns outer transaction | SAVEPOINT release never commits outer transaction |
| Successful read / repeated read | Existing formula, DTO and normal history | Same data; no duplicate regeneration |
| Root RELEASE acknowledgement uncertain | Cannot infer outcome | Quarantine handle; no blind retry; not reported as confirmed rollback |

`evidence/W1C1D_LEGACY_BEFORE.json` preserves the original ten scenarios rerun before this batch's Store edit (two engines × five scenarios). Git source also preserves the original diagnostic assertions. The existing diagnostic command still counts as one of the two Energy Extraction tests, but its failure expectations now enforce the centrally approved correction. It no longer treats missing ledger/log/audit as required parity. The eight immutable complete success snapshot hashes remain unchanged.

The new failure suite adds before/after touch, before/after resource update, all three histories, snapshot failure, native database constraint errors and direct getUser failures. SQLite node native constraint errors and the PG bridge's existing normalized constraint errors have different pre-existing synthetic-error status mappings (500 versus 409); this batch leaves the API error handler unchanged. Ordinary success and unauthorized contracts are still compared by the existing three-engine suite.

A confirmed rollback may be followed by a new read, which creates exactly one complete regeneration group. This is not historical repair and does not recreate ledger rows for previously committed defects. Previously missing production records remain outside this work package.

The known PRE-BETA blocker is closed for the newly tested synchronous Session/Energy operation once final validation passes. This does not assert that all legacy Store business operations are atomic, that historic data has been repaired, or that the synchronous PG bridge is ready for production mixed async/sync API traffic.

## Cookie boundary (separate test-only commit)

The original assertion `/Max-Age=6047\d\d/i` excludes the legitimate exact seven-day TTL, 604800 seconds. Existing `sessionCookie()` uses `floor((expiresAt - Date.now()) / 1000)`; when issuance and serialization share the same millisecond, the exact boundary is possible. The authorized test-only change accepts either the existing 6047xx range or exactly 604800, with an end/semicolon boundary. It continues rejecting 604801 and larger values. No TTL, expiration, token, login, session or cookie implementation changes are made. Historical failure/success evidence is preserved in the delivery.
