# AUTH-01A.1 Deployment Readiness — Audit Only

Current implementation PR checks report Vercel looper-merchant SUCCESS, looper-admin SUCCESS, looper SUCCESS and looper-site FAILURE. Raw links/states are included in pr-checks evidence. These are GitHub/Vercel check results, not a claim of completed production authentication acceptance.

The source checkout has no apps/site. Existing verified W1C01 evidence records Root Directory=apps/site and NOW_SANDBOX_WORKER_ROOTDIR_NOT_EXIST; the central request confirms the same diagnosis. The current failure check is recorded separately; no Vercel project settings were read or changed through the production console and no manual production deployment was initiated. Existing PR integration may create previews automatically.

Recommendation: central review should identify the intended site source and approve a separate root-directory/project correction. Do not treat this independent deployment issue as PostgreSQL parity failure. No domain, project deletion or deployment setting was changed.

Launch gates still separate: real Google client credentials/consent and device/browser end-to-end acceptance; commercial onboarding review for newly created immediately redeemable branches; deployment configuration and any wider production-security work. Supabase and Native App remain untouched.
