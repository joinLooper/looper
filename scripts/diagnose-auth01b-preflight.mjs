// AUTH-01B preflight diagnostic, not a staff-login acceptance suite.
// Synthetic fixtures only; no provider calls, cloud database, or live identities.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { harness, merchant, plain } from "../apps/api/test-parity/fixtures.ts";
const output = "output/auth01b";
mkdirSync(output, { recursive: true });
const results = {
  sourceHead: "6d8ab1d9da392d9619f338992a842cc9398f69b4",
  checkoutHead: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  kind: "PREFLIGHT_DIAGNOSTICS_NOT_AUTH01B_ACCEPTANCE",
  engines: [],
  findings: [],
  errors: [],
};
const observed = (engine, name, data) =>
  results.findings.push({ engine, name, ...data });
for (const engine of ["sqlite", "postgres"]) {
  const name = `auth01b_preflight_${process.pid}_${engine}`;
  const h = await harness(engine, name);
  try {
    const first = merchant(h, "staff-first").profile;
    const second = merchant(h, "other-brand").profile;
    let seq = 0;
    const account = (label) =>
      h.store.createAccount({
        displayName: label,
        actorId: "isolated-fixture",
        idempotencyKey: `auth01b-${label}`,
      }).account.accountId;
    const membership = (accountId, branch, role = "branch_staff") =>
      h.store.createMerchantOperatorMembership({
        accountId,
        brandId: branch.brandId,
        merchantId: role === "brand_owner" ? null : branch.id,
        role,
        actorId: "isolated-fixture",
      });
    const invitation = (accountId) =>
      h.store.createAccountInvitation({
        accountId,
        actorId: "isolated-fixture",
        merchantAppBaseUrl: "https://merchant.test",
        idempotencyKey: `auth01b-invitation-${++seq}`,
      });
    const redeem = (invite) =>
      h.store.redeemAccountInvitation({
        token: invite.invitationToken,
        origin: "https://merchant.test",
        merchantAppUrl: "https://merchant.test",
        production: false,
      });
    const bindFixture = (id, subject) => {
      const now = new Date().toISOString();
      h.db
        .prepare(
          "INSERT INTO account_external_identities(id, account_id, provider, provider_subject, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(randomUUID(), id, "line", subject, now, now);
    };
    const countUsers = (id) =>
      Number(
        h.db
          .prepare("SELECT COUNT(*) AS n FROM users WHERE account_id=?")
          .get(id).n,
      );
    const req = (url, cookie) =>
      h.app.inject({ method: "GET", url, headers: { cookie } });

    // Models the REQUIRED post-bind state of a staff-first login, without implementing it.
    const staffId = account("staff-first-no-player");
    membership(staffId, first);
    bindFixture(staffId, "synthetic-staff-first-subject");
    const staffInvite = invitation(staffId);
    const staffSession = redeem(staffInvite);
    assert.equal(countUsers(staffId), 0);
    const before = h.snapshot();
    const response = await h.app.inject({
      method: "POST",
      url: "/auth/player/line/session",
      headers: { origin: "https://player.test" },
      payload: { idToken: "synthetic-staff-first-subject" },
    });
    // Native SQLite unique errors currently reach 500; sync PG maps SQLSTATE 23505 to the API constraint code (409).
    assert.equal(response.statusCode, engine === "sqlite" ? 500 : 409);
    assert.deepEqual(h.snapshot(), before);
    assert.equal(countUsers(staffId), 0);
    observed(engine, "STAFF_FIRST_PLAYER_LOGIN", {
      status: response.statusCode,
      error: response.json().message,
      existingAccountPreserved: true,
      noProfileCreated: true,
      allInventoriedTablesUnchanged: true,
      snapshotTableCount: Object.keys(before).length,
      conclusion:
        "BLOCKER: existing LINE identity without users row is not reused by player login",
    });

    // Inverse order works: existing player + new staff membership, separate session purposes.
    const player = h.session("synthetic-player-first-subject");
    const playerId = player.auth.context.accountId;
    membership(playerId, first);
    const dual = redeem(invitation(playerId));
    assert.equal(dual.account.accountId, playerId);
    const dualCookie = `looper_session=${dual.sessionToken}`;
    const statuses = {
      playerWithPlayer: (await req("/auth/player/session", player.cookie))
        .statusCode,
      merchantWithMerchant: (await req("/merchant/context", dualCookie))
        .statusCode,
      merchantWithPlayerTokenInMerchantCookie: (
        await req(
          "/merchant/context",
          `looper_session=${player.auth.sessionToken}`,
        )
      ).statusCode,
      playerWithMerchantTokenInPlayerCookie: (
        await req(
          "/auth/player/session",
          `looper_player_session=${dual.sessionToken}`,
        )
      ).statusCode,
      platformWithMerchant: (await req("/admin/accounts", dualCookie))
        .statusCode,
    };
    assert.deepEqual(statuses, {
      playerWithPlayer: 200,
      merchantWithMerchant: 200,
      merchantWithPlayerTokenInMerchantCookie: 403,
      playerWithMerchantTokenInPlayerCookie: 401,
      platformWithMerchant: 403,
    });
    observed(engine, "PLAYER_FIRST_DUAL_PURPOSE", {
      ...statuses,
      sameAccount: true,
      conclusion:
        "Existing tables support player-first dual-purpose sessions; staff-first orchestration is missing",
    });

    const staffCookie = `looper_session=${staffSession.sessionToken}`;
    const branchPath = (id) =>
      `/merchant/task-code-submissions?merchantId=${id}`;
    assert.equal(
      (await req(branchPath(first.id), staffCookie)).statusCode,
      200,
    );
    assert.equal(
      (await req(branchPath(second.id), staffCookie)).statusCode,
      403,
    );
    membership(staffId, second, "brand_owner");
    const ownerAccess = await req(branchPath(second.id), staffCookie);
    assert.equal(ownerAccess.statusCode, 200);
    const context = (await req("/merchant/context", staffCookie)).json();
    assert.ok(
      context.branches.some(
        (b) => b.merchantId === second.id && b.role === "brand_owner",
      ),
    );
    h.db
      .prepare(
        "UPDATE merchant_operator_memberships SET status='left' WHERE account_id=? AND role='branch_staff'",
      )
      .run(staffId);
    const afterRevocation = await req("/merchant/context", staffCookie);
    assert.equal(afterRevocation.statusCode, 200);
    assert.equal(
      (await req(branchPath(first.id), staffCookie)).statusCode,
      403,
    );
    assert.equal(
      (await req(branchPath(second.id), staffCookie)).statusCode,
      200,
    );
    observed(engine, "MERCHANT_ACCOUNT_AGGREGATION", {
      staffOnlyOtherBranch: 403,
      sameSessionAfterOwnerMembership: 200,
      contextAfterStaffRevocation: 200,
      revokedStaffBranch: 403,
      ownerBranchAfterStaffRevocation: 200,
      conclusion:
        "Current owner authorization is legitimate; generic merchant session cannot represent the NEW staff-only branch ceiling. Not an existing unauthorized cross-brand exploit.",
    });

    const invitationRow = h.db
      .prepare("SELECT * FROM account_invitations WHERE id=?")
      .get(staffInvite.invitationId);
    const sessionRow = h.db
      .prepare("SELECT * FROM account_sessions WHERE id=?")
      .get(staffSession.account.sessionId);
    for (const row of [invitationRow, sessionRow]) {
      assert.equal(row.purpose, "merchant_operator");
      assert.ok(!("merchant_id" in row));
      assert.ok(!("membership_id" in row));
      assert.ok(!("provider" in row));
    }
    observed(engine, "INVITATION_SESSION_SCOPE", {
      invitationColumns: Object.keys(invitationRow),
      sessionColumns: Object.keys(sessionRow),
      legacyRedeemRequiresProviderVerification: false,
      conclusion:
        "Existing invite/session rows lack staff-specific branch, membership, provider provenance. Legacy redemption remains invitation-only when Google flag is OFF; a future staff invite must not fall back to it.",
    });

    const otherAccount = account("subject-conflict");
    let duplicateError;
    try {
      bindFixture(otherAccount, "synthetic-staff-first-subject");
    } catch (e) {
      duplicateError = e.message;
    }
    assert.ok(duplicateError);
    const linked = plain(
      h.db
        .prepare(
          "SELECT account_id FROM account_external_identities WHERE provider='line' AND provider_subject=?",
        )
        .get("synthetic-staff-first-subject"),
    );
    assert.equal(linked.account_id, staffId);
    observed(engine, "SUBJECT_CONFLICT", {
      uniqueConstraintEnforced: true,
      originalAccountPreserved: true,
      applicationAccountLinkConflictImplemented: false,
      conclusion:
        "DB prevents duplicate subject; future login must explicitly return ACCOUNT_LINK_CONFLICT without merge",
    });
    const legacyRead = await h.app.inject({
      method: "GET",
      url: "/merchant/redemptions",
      headers: { "x-looper-role": "merchant" },
    });
    assert.equal(legacyRead.statusCode, 200);
    assert.deepEqual(legacyRead.json(), plain(h.store.redemptions));
    observed(engine, "LEGACY_GLOBAL_REDEMPTION_READ", {
      status: 200,
      authenticatedSession: false,
      authorization: "client role header",
      globalGetterMatches: true,
      returnedCount: legacyRead.json().length,
      conclusion:
        "Separate existing route exposure: staff rollout cannot claim branch-only data access while this unscoped read remains. No real player data was accessed.",
    });
    results.engines.push({
      engine,
      completedDiagnostics: 6,
      fixtureCleanup: "pending",
    });
  } catch (e) {
    results.errors.push({ engine, message: e.message, stack: e.stack });
    throw e;
  } finally {
    if (engine === "postgres") {
      h.db.exec(`DROP SCHEMA IF EXISTS w1b_${name} CASCADE`);
      h.db
        .prepare("DELETE FROM w1b_control.queue_counters WHERE schema_name=?")
        .run(`w1b_${name}`);
    }
    await h.close();
    const record = results.engines.find((x) => x.engine === engine);
    if (record) record.fixtureCleanup = "complete";
    writeFileSync(
      `${output}/AUTH01B_PREFLIGHT_RESULTS.json`,
      JSON.stringify(results, null, 2) + "\n",
    );
  }
}
console.log(
  JSON.stringify(
    {
      kind: results.kind,
      diagnostics: results.findings.length,
      engines: results.engines,
      decision: "STOP: CENTRAL DECISION REQUIRED BEFORE IMPLEMENTATION",
    },
    null,
    2,
  ),
);
