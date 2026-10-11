# W1C0 Recommended W1C Implementation Plan

This is a recommendation for central review; no W1C implementation starts in this package.

1. Confirm an APAC region and monthly spend ceiling, then approve an independent Looper staging project.
2. Add an asynchronous bounded PostgreSQL pool repository behind the existing persistence contract, with acquire/query/request cancellation, statement timeout, health, drain, and restart behavior.
3. Add a controlled hosted CI trigger and require frozen install, all baseline suites, browser capture, and PG parity evidence.
4. Provision staging only after approval, with backend-only schema, dedicated roles, no Data API exposure, separate secrets, and no production data.
5. Rehearse schema/migration and restore from a clean fixture; run parity, concurrency, failure-injection, latency, and shutdown gates.
6. Present a new central review package. Production migration remains a later authorized package.
