import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { harness, merchant, plain } from "../apps/api/test-parity/fixtures.ts";
import { buildApp } from "../apps/api/src/app.ts";
import { migrateMerchantGoogle } from "../apps/api/src/merchant-google-schema.ts";
import { PLATFORM_ROLE_PERMISSIONS } from "../packages/types/src/index.ts";
const records = [];
let seq = 0;
const hash = (x) => createHash("sha256").update(x).digest("hex");
const opaque = () => randomBytes(32).toString("base64url");
async function fixture(engine, enabled, fn) {
  const name = `auth01a1_${process.pid}_${++seq}`;
  const h = await harness(engine, name);
  let app;
  try {
    if (enabled) migrateMerchantGoogle(h.db, engine);
    app = await buildApp(h.store, {
      production: false,
      adminAppUrl: "https://admin.test",
      merchantAppUrl: "https://merchant.test",
      playerAppUrl: "https://player.test",
      merchantGoogle: {
        enabled,
        clientId: "isolated-test.apps.googleusercontent.com",
      },
    });
    await app.ready();
    const m = merchant(h, "admin-security").profile;
    const other = merchant(h, "other-brand").profile;
    const account = (label) =>
      h.store.createAccount({
        displayName: label,
        idempotencyKey: `auth01a1-account-${label}`,
        actorId: "fixture-bootstrap",
      }).account.accountId;
    function session(role = "super_admin", purpose = "platform_operator") {
      const id = opaque(),
        accountId = account(id),
        token = opaque(),
        now = new Date().toISOString(),
        expires = new Date(Date.now() + 3600000).toISOString();
      if (purpose === "platform_operator")
        h.db
          .prepare(
            "INSERT INTO platform_operator_memberships(id,account_id,role,status,created_at,updated_at) VALUES (?,?,?,'active',?,?)",
          )
          .run(id, accountId, role, now, now);
      else
        h.store.createMerchantOperatorMembership({
          accountId,
          brandId: m.brandId,
          merchantId: role.startsWith("branch_") ? m.id : null,
          role,
          actorId: "fixture-bootstrap",
        });
      h.db
        .prepare(
          "INSERT INTO account_invitations(id,account_id,purpose,token_hash,status,expires_at,redeemed_at,created_by_actor_id,creation_idempotency_key,created_at,updated_at) VALUES (?,?,?,?,'redeemed',?,?,'fixture-bootstrap',?,?,?)",
        )
        .run(
          id,
          accountId,
          purpose,
          hash(opaque()),
          expires,
          now,
          id,
          now,
          now,
        );
      h.db
        .prepare(
          "INSERT INTO account_sessions(id,account_id,purpose,token_hash,expires_at,created_from_invitation_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
        )
        .run(id, accountId, purpose, hash(token), expires, id, now, now);
      return { id, accountId, token, cookie: `looper_session=${token}` };
    }
    const admin = session();
    const target = account("target");
    const branch = {
      branchCode: "security-branch",
      storeName: "安全驗證分店",
      address: "test address",
      rewardCategory: "general",
      actorId: "forged-actor",
    };
    const routes = [
      {
        method: "POST",
        url: `/admin/merchant-brands/${m.brandId}/branches`,
        payload: branch,
      },
      { method: "GET", url: "/admin/accounts" },
      {
        method: "GET",
        url: `/admin/merchant-operator-memberships?brandId=${m.brandId}`,
      },
      {
        method: "GET",
        url: "/admin/reports/task-code/monthly-live?reportMonth=2026-10",
      },
      {
        method: "POST",
        url: "/admin/accounts",
        payload: {
          displayName: "Created via platform",
          idempotencyKey: "canonical-created-account",
          actorId: "forged-actor",
        },
      },
      {
        method: "POST",
        url: "/admin/merchant-operator-memberships",
        payload: {
          accountId: target,
          brandId: m.brandId,
          merchantId: m.id,
          role: "branch_manager",
          actorId: "forged-actor",
        },
      },
      {
        method: "POST",
        url: "/admin/account-invitations",
        payload: {
          accountId: target,
          idempotencyKey: "canonical-created-invite",
          actorId: "forged-actor",
        },
      },
    ];
    const request = (
      r,
      cookie = admin.cookie,
      origin = r.method === "POST" ? "https://admin.test" : undefined,
      extra = {},
    ) =>
      app.inject({
        ...r,
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(origin === undefined ? {} : { origin }),
          ...extra,
        },
      });
    const snapshot = () => h.snapshot();
    const deny = async (r, cookie, status = 403, origin, extra) => {
      const before = snapshot();
      const response = await request(r, cookie, origin, extra);
      assert.equal(response.statusCode, status, `${r.url}: ${response.body}`);
      assert.deepEqual(snapshot(), before, "denial must not write");
      return response;
    };
    await fn({
      ...h,
      app,
      m,
      other,
      account,
      session,
      admin,
      target,
      branch,
      routes,
      request,
      snapshot,
      deny,
    });
  } finally {
    if (app) await app.close();
    if (engine === "postgres") {
      h.db.exec(`DROP SCHEMA IF EXISTS w1b_${name} CASCADE`);
      h.db
        .prepare("DELETE FROM w1b_control.queue_counters WHERE schema_name=?")
        .run(`w1b_${name}`);
    }
    await h.close();
  }
}
function check(name, fn) {
  for (const engine of ["sqlite", "postgres"])
    for (const enabled of [false, true])
      test(`${engine} Google=${enabled}: ${name}`, async () => {
        await fixture(engine, enabled, fn);
        records.push({ engine, googleEnabled: enabled, name, pass: true });
      });
}
test("branch-create canonical grant is super_admin only; other role lists stay unchanged", () => {
  assert.ok(
    PLATFORM_ROLE_PERMISSIONS.super_admin.includes(
      "platform.merchant_branch.create",
    ),
  );
  assert.deepEqual(PLATFORM_ROLE_PERMISSIONS.operations_admin, [
    "platform.reporting.read",
    "platform.audit.read",
    "platform.merchant_application.read",
    "platform.merchant_application.review",
    "platform.merchant_plan.read",
    "platform.economy.read",
    "platform.reversal.request",
  ]);
  assert.deepEqual(PLATFORM_ROLE_PERMISSIONS.finance_admin, [
    "platform.reporting.read",
    "platform.audit.read",
    "platform.merchant_plan.read",
    "platform.merchant_plan.manage",
    "platform.economy.read",
    "platform.economy.manage",
    "platform.reversal.review",
    "platform.reversal.apply",
  ]);
  records.push({
    name: "canonical grant and unchanged role lists",
    pass: true,
  });
});
check(
  "all seven routes reject missing / forged admin authority without writes",
  async (h) => {
    for (const r of h.routes) {
      await h.deny(r, null, 401);
      await h.deny(r, null, 401, undefined, {
        "x-looper-role": "admin",
        "x-looper-account-id": h.admin.accountId,
        "x-looper-permissions":
          "platform.merchant_branch.create,platform.identity.manage,platform.reporting.read",
      });
    }
  },
);
check(
  "expired/revoked/inactive sessions and memberships are rejected on every route",
  async (h) => {
    for (const [table, column, bad, good, status] of [
      [
        "account_sessions",
        "expires_at",
        "2000-01-01T00:00:00.000Z",
        new Date(Date.now() + 3600000).toISOString(),
        401,
      ],
      ["account_sessions", "revoked_at", new Date().toISOString(), null, 401],
      ["accounts", "status", "suspended", "active", 401],
      ["accounts", "status", "closed", "active", 401],
      ["platform_operator_memberships", "status", "suspended", "active", 403],
      ["platform_operator_memberships", "status", "left", "active", 403],
    ]) {
      const id = table === "accounts" ? h.admin.accountId : h.admin.id;
      h.db.prepare(`UPDATE ${table} SET ${column}=? WHERE id=?`).run(bad, id);
      for (const r of h.routes) await h.deny(r, h.admin.cookie, status);
      h.db.prepare(`UPDATE ${table} SET ${column}=? WHERE id=?`).run(good, id);
    }
  },
);
check(
  "purpose isolation: every Merchant role and Player cannot acquire platform authority",
  async (h) => {
    for (const role of [
      "brand_owner",
      "brand_manager",
      "branch_manager",
      "branch_staff",
    ]) {
      const session = h.session(role, "merchant_operator");
      for (const r of h.routes)
        await h.deny(r, session.cookie, 403, undefined, {
          "x-looper-role": "admin",
        });
    }
    const player = h.store.createPlayerSession(
      {
        provider: "line",
        providerSubject: "isolated-player",
        displayName: "player",
      },
      604800,
    );
    for (const r of h.routes) {
      await h.deny(r, `looper_session=${player.sessionToken}`, 403);
      await h.deny(r, `looper_player_session=${player.sessionToken}`, 401);
    }
    // A merchant-purpose session cannot use even an account's valid platform membership.
    const merchantSession = h.session("brand_owner", "merchant_operator"),
      now = new Date().toISOString();
    h.db
      .prepare(
        "INSERT INTO platform_operator_memberships(id,account_id,role,status,created_at,updated_at) VALUES (?,?,'super_admin','active',?,?)",
      )
      .run(opaque(), merchantSession.accountId, now, now);
    for (const r of h.routes) await h.deny(r, merchantSession.cookie, 403);
  },
);
check(
  "operations / finance permissions deny mutations and identity reads, allow reporting",
  async (h) => {
    for (const role of ["operations_admin", "finance_admin"]) {
      const s = h.session(role);
      for (const r of h.routes) {
        if (r === h.routes[3]) {
          const before = h.snapshot();
          assert.equal((await h.request(r, s.cookie)).statusCode, 200);
          assert.deepEqual(h.snapshot(), before);
        } else await h.deny(r, s.cookie, 403);
      }
    }
  },
);
check(
  "exact mutation Origin and valid GET without Origin; forged actor ignored",
  async (h) => {
    for (const r of h.routes.filter((r) => r.method === "POST"))
      for (const origin of [
        null,
        "null",
        "https://evil.test",
        "https://admin.test.evil.test",
        "https://admin.test/",
        "https://merchant.test",
        "https://player.test",
      ]) {
        // null here means deliberately omit the Origin header, bypassing request helper defaults.
        const before = h.snapshot();
        const res = await h.app.inject({
          ...r,
          headers: {
            cookie: h.admin.cookie,
            ...(origin === null ? {} : { origin }),
          },
        });
        assert.equal(res.statusCode, 403, res.body);
        assert.deepEqual(h.snapshot(), before);
      }
    for (const r of h.routes.filter((r) => r.method === "GET")) {
      const before = h.snapshot();
      assert.equal((await h.request(r)).statusCode, 200);
      assert.deepEqual(h.snapshot(), before);
    }
  },
);
check(
  "seven-route successful contract, session audit actor, cross-brand platform scope",
  async (h) => {
    for (const r of h.routes) {
      const response = await h.request(r);
      assert.equal(
        response.statusCode,
        r.method === "POST" ? 201 : 200,
        response.body,
      );
    }
    const created = h.store.getMerchant(
      h.db
        .prepare("SELECT id FROM merchants WHERE brand_id=? AND branch_code=?")
        .get(h.m.brandId, h.branch.branchCode).id,
    );
    assert.equal(created.brandId, h.m.brandId);
    assert.equal(created.status, "active");
    assert.equal(
      h.db
        .prepare("SELECT can_redeem FROM merchants WHERE id=?")
        .get(created.id).can_redeem,
      1,
    );
    const audits = plain(
      h.db
        .prepare("SELECT * FROM audit_events WHERE actor_id=?")
        .all(h.admin.accountId),
    );
    assert.equal(audits.length, 4);
    assert.ok(audits.some((a) => a.action === "merchant.branch_created"));
    assert.equal(
      h.db
        .prepare("SELECT COUNT(*) AS n FROM audit_events WHERE actor_id=?")
        .get("forged-actor").n,
      0,
    );
    const invite = h.db
      .prepare(
        "SELECT * FROM account_invitations WHERE account_id=? AND purpose='merchant_operator'",
      )
      .get(h.target);
    assert.equal(invite.created_by_actor_id, h.admin.accountId);
    const other = {
      ...h.routes[0],
      url: `/admin/merchant-brands/${h.other.brandId}/branches`,
    };
    assert.equal((await h.request(other)).statusCode, 201);
    const replay = await h.request(h.routes[0]);
    assert.equal(replay.statusCode, 200);
    assert.equal(replay.json().merchantId, created.id);
    const conflict = await h.request({
      ...h.routes[0],
      payload: { ...h.branch, storeName: "different" },
    });
    assert.equal(conflict.statusCode, 409);
  },
);
check(
  "brand existence, active state and relationship constraints remain enforced",
  async (h) => {
    await h.deny(
      { ...h.routes[0], url: "/admin/merchant-brands/missing/branches" },
      h.admin.cookie,
      404,
    );
    h.db
      .prepare("UPDATE merchant_brands SET status='suspended' WHERE id=?")
      .run(h.m.brandId);
    await h.deny(h.routes[0], h.admin.cookie, 409);
    h.db
      .prepare("UPDATE merchant_brands SET status='active' WHERE id=?")
      .run(h.m.brandId);
    await h.deny(
      {
        ...h.routes[5],
        payload: { ...h.routes[5].payload, merchantId: h.other.id },
      },
      h.admin.cookie,
      409,
    );
    // Both DB engines must still reject a cross-brand row even outside the route.
    assert.throws(
      () =>
        h.db
          .prepare(
            "INSERT INTO merchant_operator_memberships(id,account_id,brand_id,merchant_id,role,status,created_at,updated_at) VALUES (?,?,?,?,'branch_manager','active',?,?)",
          )
          .run(
            opaque(),
            h.target,
            h.m.brandId,
            h.other.id,
            new Date().toISOString(),
            new Date().toISOString(),
          ),
      /membership merchant must belong to brand|constraint/i,
    );
  },
);
check(
  "logout CSRF, purpose-specific Origin, normal and repeated logout, rollback",
  async (h) => {
    const r = { method: "POST", url: "/auth/logout" };
    for (const [s, correct, wrong] of [
      [h.admin, "https://admin.test", "https://merchant.test"],
      [
        h.session("brand_owner", "merchant_operator"),
        "https://merchant.test",
        "https://admin.test",
      ],
    ]) {
      for (const origin of [
        "https://evil.test",
        "null",
        "https://admin.test/",
        "https://sub.admin.test",
        wrong,
      ])
        await h.deny(r, s.cookie, 403, origin);
      const before = h.snapshot();
      const missing = await h.app.inject({
        ...r,
        headers: { cookie: s.cookie },
      });
      assert.equal(missing.statusCode, 403);
      assert.equal(missing.headers["set-cookie"], undefined);
      assert.deepEqual(h.snapshot(), before);
      h.store.failNextLogoutAuditWrite = true;
      await h.deny(r, s.cookie, 500, correct);
      assert.ok(h.store.resolveSessionToken(s.token));
      const done = await h.request(r, s.cookie, correct);
      assert.equal(done.statusCode, 200);
      assert.deepEqual(done.json(), { authenticated: false });
      assert.match(
        String(done.headers["set-cookie"]),
        /^looper_session=; HttpOnly; Path=\/; SameSite=Lax; Max-Age=0$/,
      );
      assert.equal(h.store.resolveSessionToken(s.token), null);
      const after = h.snapshot();
      assert.equal((await h.request(r, s.cookie, correct)).statusCode, 200);
      assert.deepEqual(h.snapshot(), after);
    }
    const player = h.store.createPlayerSession(
      {
        provider: "line",
        providerSubject: "logout-player",
        displayName: "player",
      },
      604800,
    );
    await h.deny(
      r,
      `looper_session=${player.sessionToken}`,
      403,
      "https://admin.test",
    );
    assert.equal(
      (await h.request(r, null, "https://merchant.test")).statusCode,
      200,
    );
    await h.deny(r, null, 403, "https://evil.test");
  },
);
test.after(() => {
  mkdirSync("output/auth01a1", { recursive: true });
  writeFileSync(
    "output/auth01a1/security-results.json",
    JSON.stringify(
      {
        head: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim(),
        expectedTests: 33,
        passed: records.length,
        records,
      },
      null,
      2,
    ),
  );
});
