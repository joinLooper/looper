import test from "node:test";
import { Worker } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { existsSync, unlinkSync } from "node:fs";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  harness,
  merchant,
  plain,
  credentials,
} from "../apps/api/test-parity/fixtures.ts";
import { buildApp } from "../apps/api/src/app.ts";
import { configureDatabase } from "../apps/api/src/database.ts";
import { migrateMerchantGoogle } from "../apps/api/src/merchant-google-schema.ts";
import { MerchantGoogleAuth } from "../apps/api/src/merchant-google-auth.ts";
import {
  migrateMerchantStaff,
  resolveStaffScope,
} from "../apps/api/src/merchant-staff-schema.ts";
import { MerchantStaffAuth } from "../apps/api/src/merchant-staff-auth.ts";
import { LineStaffVerifier } from "../apps/api/src/merchant-staff-verifier.ts";
const out = "output/auth01b/resume";
mkdirSync(out, { recursive: true });
const results = [];
const hash = (x) => createHash("sha256").update(x).digest("hex");
const opaque = () => randomBytes(32).toString("base64url");
const channel = "shared-isolated-line-channel";
let seq = 0;
const record = (name, fn) =>
  test(name, async () => {
    await fn();
    results.push({ name, pass: true });
  });
const claims = () => ({
  sub: "verified-subject",
  iss: "https://access.line.me",
  aud: channel,
  exp: Date.now() / 1000 + 300,
  iat: Date.now() / 1000,
  nonce: "nonce",
});
for (const [name, change] of [
  ["valid", {}],
  ["wrong issuer", { iss: "https://evil.test" }],
  ["wrong audience", { aud: "other" }],
  ["expired", { exp: 0 }],
  ["future issued", { iat: 9999999999 }],
  ["missing subject", { sub: "" }],
  ["missing nonce", { nonce: undefined }],
  ["wrong nonce", { nonce: "other" }],
  ["missing expiry", { exp: undefined }],
  ["missing iat", { iat: undefined }],
])
  record(`LINE verifier: ${name}`, async () => {
    const calls = [];
    const verifier = new LineStaffVerifier(
      channel,
      "isolated-not-real-secret",
      "https://merchant.test/staff/line/callback",
      async (url, init) => {
        calls.push({ url, params: Object.fromEntries(init.body) });
        return new Response(
          JSON.stringify(
            url.endsWith("/token")
              ? { id_token: "official-verify-test-token" }
              : { ...claims(), ...change },
          ),
          { status: 200 },
        );
      },
    );
    if (name === "valid") {
      assert.equal(
        (await verifier.exchange("code", "pkce", hash("nonce"))).subject,
        "verified-subject",
      );
      assert.equal(calls[0].params.code_verifier, "pkce");
      assert.equal(
        calls[0].params.redirect_uri,
        "https://merchant.test/staff/line/callback",
      );
      assert.equal(calls[1].url, "https://api.line.me/oauth2/v2.1/verify");
    } else
      await assert.rejects(verifier.exchange("code", "pkce", hash("nonce")), {
        code: "LINE_INVALID_CREDENTIAL",
      });
  });
record(
  "LINE verifier: invalid token, provider failure, malformed body and missing ID token",
  async () => {
    for (const [status, body, expected] of [
      [400, {}, "LINE_INVALID_CREDENTIAL"],
      [503, {}, "LINE_PROVIDER_UNAVAILABLE"],
      [200, {}, "LINE_INVALID_CREDENTIAL"],
      [200, null, "LINE_PROVIDER_UNAVAILABLE"],
    ]) {
      const verifier = new LineStaffVerifier(
        channel,
        "secret",
        "https://merchant.test/staff/line/callback",
        async () =>
          new Response(body === null ? "invalid-json" : JSON.stringify(body), {
            status,
          }),
      );
      await assert.rejects(verifier.exchange("code", "pkce", hash("nonce")), {
        code: expected,
      });
    }
    const offline = new LineStaffVerifier(
      channel,
      "secret",
      "https://merchant.test/staff/line/callback",
      async () => {
        throw Error("network");
      },
    );
    await assert.rejects(offline.exchange("code", "pkce", hash("nonce")), {
      code: "LINE_PROVIDER_UNAVAILABLE",
    });
  },
);
async function fixture(engine, fn) {
  const name = `auth01b_${process.pid}_${++seq}`,
    h = await harness(engine, name);
  let app;
  try {
    migrateMerchantGoogle(h.db, engine);
    migrateMerchantStaff(h.db);
    migrateMerchantStaff(h.db);
    const one = merchant(h, "staff-one"),
      two = merchant(h, "owner-other");
    const account = (label) =>
      h.store.createAccount({
        displayName: label,
        idempotencyKey: `auth01b-${label}`,
        actorId: "fixture",
      }).account.accountId;
    const accountId = account("staff");
    const membership = h.store.createMerchantOperatorMembership({
      accountId,
      brandId: one.profile.brandId,
      merchantId: one.profile.id,
      role: "branch_staff",
      actorId: "fixture",
    }).membership;
    const auth = new MerchantStaffAuth(
      h.store,
      channel,
      "https://merchant.test",
    );
    const verifier = {
      exchange: async (subject, _pkce, nonceHash) => ({
        subject,
        nonceHash,
        channelId: channel,
      }),
    };
    const options = {
      production: false,
      merchantAppUrl: "https://merchant.test",
      adminAppUrl: "https://admin.test",
      playerAppUrl: "https://player.test",
      merchantStaff: {
        enabled: true,
        channelId: channel,
        playerChannelId: channel,
        verifier,
      },
    };
    app = await buildApp(h.store, options);
    await app.ready();
    const platform = (role = "super_admin") => {
      const id = opaque(),
        aid = account(`platform-${id}`),
        token = opaque(),
        now = new Date().toISOString(),
        expires = new Date(Date.now() + 3600000).toISOString();
      h.db
        .prepare(
          "INSERT INTO platform_operator_memberships(id,account_id,role,status,created_at,updated_at) VALUES (?,?,?,'active',?,?)",
        )
        .run(id, aid, role, now, now);
      h.db
        .prepare(
          "INSERT INTO account_invitations(id,account_id,purpose,token_hash,status,expires_at,redeemed_at,created_by_actor_id,creation_idempotency_key,created_at,updated_at) VALUES (?,?,'platform_operator',?,'redeemed',?,?,'fixture',?,?,?)",
        )
        .run(id, aid, hash(opaque()), expires, now, id, now, now);
      h.db
        .prepare(
          "INSERT INTO account_sessions(id,account_id,purpose,token_hash,expires_at,created_from_invitation_id,created_at,updated_at) VALUES (?,?,'platform_operator',?,?,?,?,?)",
        )
        .run(id, aid, hash(token), expires, id, now, now);
      return { accountId: aid, cookie: `looper_session=${token}`, token };
    };
    const admin = platform();
    const request = (
      method,
      url,
      payload,
      cookie,
      origin = method === "POST" ? "https://merchant.test" : undefined,
    ) =>
      app.inject({
        method,
        url,
        payload,
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(origin ? { origin } : {}),
        },
      });
    const issue = async () => {
      const r = await request(
        "POST",
        "/admin/staff-invitations",
        {
          membershipId: membership.membershipId,
          idempotencyKey: `staff-invite-${opaque()}`,
        },
        admin.cookie,
        "https://admin.test",
      );
      assert.equal(r.statusCode, 201, r.body);
      return r.json();
    };
    const start = async (invitationToken, merchantId) => {
      const r = await request("POST", "/auth/merchant/line/challenge", {
        ...(invitationToken ? { invitationToken } : {}),
        ...(merchantId ? { merchantId } : {}),
      });
      assert.equal(r.statusCode, 200, r.body);
      const u = new URL(r.json().authorizationUrl);
      return {
        state: u.searchParams.get("state"),
        nonce: u.searchParams.get("nonce"),
        cookie: r.headers["set-cookie"].split(";")[0],
        url: u,
      };
    };
    const login = (c, subject = "staff-line") =>
      request(
        "POST",
        "/auth/merchant/line/session",
        { state: c.state, code: subject },
        c.cookie,
      );
    const logged = async () => {
      const invite = await issue(),
        c = await start(invite.invitationToken),
        r = await login(c);
      assert.equal(r.statusCode, 200, r.body);
      return {
        invite,
        c,
        cookie: r.headers["set-cookie"][0].split(";")[0],
        body: r.json(),
      };
    };
    const snapshot = () => ({
      ...h.snapshot(),
      ...Object.fromEntries(
        [
          "merchant_google_challenges",
          "merchant_staff_invitations",
          "merchant_staff_sessions",
          "merchant_staff_challenges",
        ].map((t) => [
          t,
          plain(h.db.prepare(`SELECT * FROM ${t} ORDER BY 1`).all()),
        ]),
      ),
    });
    await fn({
      ...h,
      app,
      options,
      name,
      one,
      two,
      accountId,
      membership,
      account,
      auth,
      admin,
      platform,
      request,
      issue,
      start,
      login,
      logged,
      snapshot,
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
for (const engine of ["sqlite", "postgres"]) {
  record(
    `${engine}: default OFF, schema explicit and same-channel authority`,
    () =>
      fixture(engine, async (h) => {
        assert.equal(
          h.db
            .prepare(
              "SELECT count(*) n FROM schema_migrations WHERE version=29",
            )
            .get().n,
          1,
        );
        const off = await buildApp(h.store, {
          ...h.options,
          merchantStaff: { enabled: false, channelId: "", playerChannelId: "" },
        });
        try {
          assert.deepEqual(
            (await off.inject("/auth/merchant/line/config")).json(),
            { enabled: false },
          );
          assert.equal(
            (
              await off.inject({
                method: "POST",
                url: "/auth/merchant/line/challenge",
                headers: { origin: "https://merchant.test" },
                payload: {},
              })
            ).statusCode,
            503,
          );
        } finally {
          await off.close();
        }
        await assert.rejects(
          buildApp(h.store, {
            ...h.options,
            merchantStaff: {
              ...h.options.merchantStaff,
              channelId: "different-provider-unverified",
            },
          }),
          /channel authority/,
        );
      }),
  );
  record(
    `${engine}: staff-first binding issues no player resources; explicit player login reuses account once`,
    () =>
      fixture(engine, async (h) => {
        const counts = () =>
          ["accounts", "users", "user_resources", "user_growth_balances"].map(
            (t) => Number(h.db.prepare(`SELECT count(*) n FROM ${t}`).get().n),
          );
        const before = counts();
        const logged = await h.logged();
        assert.deepEqual(counts(), before);
        assert.equal(logged.body.merchantId, h.one.profile.id);
        assert.equal(
          h.db
            .prepare(
              "SELECT account_id FROM account_external_identities WHERE provider='line' AND provider_subject='staff-line'",
            )
            .get().account_id,
          h.accountId,
        );
        const first = h.session("staff-line"),
          again = h.session("staff-line");
        assert.equal(first.auth.context.accountId, h.accountId);
        assert.equal(first.id, again.id);
        assert.deepEqual(counts(), [
          before[0],
          before[1] + 1,
          before[2] + 1,
          before[3] + 1,
        ]);
        assert.equal(
          (
            await h.request(
              "GET",
              "/merchant/context",
              undefined,
              logged.cookie,
            )
          ).statusCode,
          200,
        );
        assert.equal(
          (
            await h.request(
              "GET",
              "/merchant/context",
              undefined,
              `looper_session=${first.auth.sessionToken}`,
            )
          ).statusCode,
          403,
        );
        assert.equal(
          (
            await h.request(
              "GET",
              "/auth/player/session",
              undefined,
              logged.cookie.replace(
                "looper_session=",
                "looper_player_session=",
              ),
            )
          ).statusCode,
          401,
        );
        assert.equal(
          (await h.request("GET", "/admin/accounts", undefined, logged.cookie))
            .statusCode,
          403,
        );
      }),
  );
  record(
    `${engine}: canonical invitation issuer permission, Origin, idempotency and audit actor`,
    () =>
      fixture(engine, async (h) => {
        const payload = {
          membershipId: h.membership.membershipId,
          idempotencyKey: "staff-scope-idempotent",
        };
        for (const [cookie, origin, status] of [
          [undefined, "https://admin.test", 401],
          [h.platform("operations_admin").cookie, "https://admin.test", 403],
          [h.platform("finance_admin").cookie, "https://admin.test", 403],
          [h.admin.cookie, "https://evil.test", 403],
        ])
          assert.equal(
            (
              await h.request(
                "POST",
                "/admin/staff-invitations",
                payload,
                cookie,
                origin,
              )
            ).statusCode,
            status,
          );
        assert.equal(
          (
            await h.request(
              "POST",
              "/admin/staff-invitations",
              { ...payload, actorId: "forged" },
              h.admin.cookie,
              "https://admin.test",
            )
          ).statusCode,
          400,
        );
        const r = await h.request(
          "POST",
          "/admin/staff-invitations",
          payload,
          h.admin.cookie,
          "https://admin.test",
        );
        assert.equal(r.statusCode, 201, r.body);
        const replay = await h.request(
          "POST",
          "/admin/staff-invitations",
          payload,
          h.admin.cookie,
          "https://admin.test",
        );
        assert.equal(replay.statusCode, 200);
        assert.equal(replay.json().invitationToken, undefined);
        assert.equal(
          h.db
            .prepare(
              "SELECT actor_id FROM audit_events WHERE action='identity.line_staff_invitation_created'",
            )
            .get().actor_id,
          h.admin.accountId,
        );
        const manager = h.store.createMerchantOperatorMembership({
          accountId: h.account("manager"),
          brandId: h.two.profile.brandId,
          role: "brand_owner",
          actorId: "fixture",
        }).membership;
        assert.equal(
          (
            await h.request(
              "POST",
              "/admin/staff-invitations",
              { ...payload, membershipId: manager.membershipId },
              h.admin.cookie,
              "https://admin.test",
            )
          ).statusCode,
          403,
        );
        const staff = await h.logged();
        assert.equal(
          (
            await h.request(
              "POST",
              "/admin/staff-invitations",
              payload,
              staff.cookie,
              "https://admin.test",
            )
          ).statusCode,
          403,
        );
      }),
  );
  record(
    `${engine}: state, PKCE, browser binding, exact Origin and replay`,
    () =>
      fixture(engine, async (h) => {
        const invite = await h.issue(),
          c = await h.start(invite.invitationToken);
        assert.equal(c.url.origin, "https://access.line.me");
        assert.equal(c.url.searchParams.get("client_id"), channel);
        assert.equal(c.url.searchParams.get("code_challenge_method"), "S256");
        assert.equal(c.state.length, 64);
        const row = h.db
          .prepare("SELECT * FROM merchant_staff_challenges WHERE state_hash=?")
          .get(hash(c.state));
        assert.equal(
          c.url.searchParams.get("code_challenge"),
          createHash("sha256").update(row.code_verifier).digest("base64url"),
        );
        assert.equal(row.nonce_hash, hash(c.nonce));
        const before = h.snapshot();
        for (const [cookie, origin] of [
          [undefined, "https://merchant.test"],
          [c.cookie, "https://evil.test"],
          [c.cookie, undefined],
        ]) {
          const r = await h.request(
            "POST",
            "/auth/merchant/line/session",
            { state: c.state, code: "staff-line" },
            cookie,
            origin ?? "",
          );
          assert.equal(r.statusCode, 403);
        }
        assert.deepEqual(h.snapshot(), before);
        assert.equal((await h.login(c)).statusCode, 200);
        assert.equal((await h.login(c)).statusCode, 403);
        assert.equal(
          (
            await h.request("POST", "/auth/merchant/line/challenge", {
              invitationToken: invite.invitationToken,
            })
          ).statusCode,
          409,
        );
      }),
  );
  record(
    `${engine}: scoped context, current, pending, decision, history and monthly cannot inherit owner`,
    () =>
      fixture(engine, async (h) => {
        h.store.createMerchantOperatorMembership({
          accountId: h.accountId,
          brandId: h.two.profile.brandId,
          role: "brand_owner",
          actorId: "fixture",
        });
        const login = await h.logged();
        const context = (
          await h.request("GET", "/merchant/context", undefined, login.cookie)
        ).json();
        assert.equal(context.branches.length, 1);
        assert.equal(context.branches[0].role, "branch_staff");
        assert.equal(context.memberships.length, 1);
        for (const path of [
          "/merchant/task-code/current",
          "/merchant/task-code-submissions",
          "/merchant/task-code-submissions/history",
        ])
          assert.equal(
            (
              await h.request(
                "GET",
                `${path}?merchantId=${h.two.profile.id}`,
                undefined,
                login.cookie,
              )
            ).statusCode,
            403,
          );
        assert.equal(
          (
            await h.request(
              "GET",
              `/merchant/reports/task-code/monthly-live?reportMonth=2026-10&merchantId=${h.two.profile.id}`,
              undefined,
              login.cookie,
            )
          ).statusCode,
          403,
        );
        assert.equal(
          (
            await h.request(
              "POST",
              "/merchant/task-code-submissions/fake/decision",
              {
                merchantId: h.two.profile.id,
                decision: "confirm",
                idempotencyKey: "scope-decision",
              },
              login.cookie,
            )
          ).statusCode,
          403,
        );
        const player = h.session("history-player");
        const submissions = [];
        for (const m of [h.one, h.two]) {
          const window = h.store.getCurrentTaskCode(m.profile.id);
          const sub = h.store.submitTaskCode({
            userId: player.id,
            missionId: m.mission.id,
            merchantId: m.profile.id,
            code: window.code,
            idempotencyKey: `submit-${m.profile.id}`,
          }).submission;
          h.store.decideTaskCodeSubmission({
            submissionId: sub.id,
            merchantId: m.profile.id,
            decision: "reject",
            actorId: "fixture",
            idempotencyKey: `reject-${sub.id}`,
          });
          submissions.push(sub);
        }
        const history = await h.request(
          "GET",
          "/merchant/task-code-submissions/history",
          undefined,
          login.cookie,
        );
        assert.equal(history.statusCode, 200, history.body);
        assert.equal(history.json().items.length, 1);
        assert.equal(history.json().items[0].merchantId, h.one.profile.id);
        const report = await h.request(
          "GET",
          "/merchant/reports/task-code/monthly-live?reportMonth=2026-10",
          undefined,
          login.cookie,
        );
        assert.equal(report.statusCode, 200, report.body);
        assert.equal(
          JSON.stringify(report.json()).includes(h.two.profile.id),
          false,
        );
        const win = h.store.getCurrentTaskCode(h.one.profile.id);
        const pending = h.store.submitTaskCode({
          userId: player.id,
          missionId: h.one.mission.id,
          merchantId: h.one.profile.id,
          code: win.code,
          idempotencyKey: "another-pending",
        }).submission;
        const decision = await h.request(
          "POST",
          `/merchant/task-code-submissions/${pending.id}/decision`,
          {
            merchantId: h.one.profile.id,
            decision: "reject",
            idempotencyKey: "authorized-staff-decision",
            actorId: "forged",
          },
          login.cookie,
        );
        assert.equal(decision.statusCode, 200, decision.body);
        assert.equal(decision.json().decidedBy, h.accountId);
      }),
  );
  record(
    `${engine}: every request rechecks session, membership, account, invitation, brand and branch`,
    () =>
      fixture(engine, async (h) => {
        h.store.createMerchantOperatorMembership({
          accountId: h.accountId,
          brandId: h.two.profile.brandId,
          role: "brand_owner",
          actorId: "fixture",
        });
        const login = await h.logged();
        const session = h.db
          .prepare("SELECT * FROM merchant_staff_sessions")
          .get();
        for (const [table, column, value, idColumn, id] of [
          ["accounts", "status", "suspended", "id", h.accountId],
          [
            "merchant_operator_memberships",
            "status",
            "left",
            "id",
            h.membership.membershipId,
          ],
          [
            "merchant_operator_memberships",
            "status",
            "suspended",
            "id",
            h.membership.membershipId,
          ],
          [
            "merchant_operator_memberships",
            "role",
            "branch_manager",
            "id",
            h.membership.membershipId,
          ],
          [
            "merchant_brands",
            "status",
            "suspended",
            "id",
            h.one.profile.brandId,
          ],
          ["merchants", "status", "suspended", "id", h.one.profile.id],
          ["merchants", "can_redeem", 0, "id", h.one.profile.id],
          [
            "account_invitations",
            "status",
            "revoked",
            "id",
            login.invite.invitationId,
          ],
          [
            "account_sessions",
            "expires_at",
            "2000-01-01",
            "id",
            session.session_id,
          ],
          [
            "account_sessions",
            "revoked_at",
            "2026-01-01",
            "id",
            session.session_id,
          ],
          [
            "merchant_staff_sessions",
            "channel_id",
            "wrong",
            "session_id",
            session.session_id,
          ],
        ]) {
          const old = h.db
            .prepare(`SELECT ${column} FROM ${table} WHERE ${idColumn}=?`)
            .get(id)[column];
          h.db
            .prepare(`UPDATE ${table} SET ${column}=? WHERE ${idColumn}=?`)
            .run(value, id);
          const before = h.snapshot();
          const r = await h.request(
            "GET",
            "/merchant/context",
            undefined,
            login.cookie,
          );
          assert.ok(
            [401, 403].includes(r.statusCode),
            `${table}.${column}: ${r.body}`,
          );
          assert.deepEqual(h.snapshot(), before);
          h.db
            .prepare(`UPDATE ${table} SET ${column}=? WHERE ${idColumn}=?`)
            .run(old, id);
        }
        assert.equal(
          (await h.request("GET", "/merchant/context", undefined, login.cookie))
            .statusCode,
          200,
        );
      }),
  );
  record(
    `${engine}: expired/revoked invitations and changed membership during OAuth fail closed`,
    () =>
      fixture(engine, async (h) => {
        const invite = await h.issue(),
          c = await h.start(invite.invitationToken);
        h.db
          .prepare(
            "UPDATE account_invitations SET expires_at='2000-01-01' WHERE id=?",
          )
          .run(invite.invitationId);
        const before = h.snapshot();
        const r = await h.login(c);
        assert.equal(r.statusCode, 409);
        assert.equal(r.json().code, "STAFF_INVITATION_EXPIRED");
        assert.deepEqual(h.snapshot(), before);
        const next = await h.issue(),
          nextC = await h.start(next.invitationToken);
        h.db
          .prepare(
            "UPDATE merchant_operator_memberships SET status='left' WHERE id=?",
          )
          .run(h.membership.membershipId);
        assert.equal((await h.login(nextC)).statusCode, 403);
      }),
  );
  record(
    `${engine}: other Account subject conflict and second LINE binding never merge`,
    () =>
      fixture(engine, async (h) => {
        const original = h.session("already-owned");
        const invite = await h.issue(),
          c = await h.start(invite.invitationToken),
          before = h.snapshot();
        const r = await h.login(c, "already-owned");
        assert.equal(r.statusCode, 409);
        assert.equal(r.json().code, "ACCOUNT_LINK_CONFLICT");
        assert.deepEqual(h.snapshot(), before);
        assert.notEqual(original.auth.context.accountId, h.accountId);
        const ok = await h.login(c, "staff-line");
        assert.equal(ok.statusCode, 200);
        const next = await h.issue(),
          c2 = await h.start(next.invitationToken),
          before2 = h.snapshot();
        const conflict = await h.login(c2, "different-subject");
        assert.equal(conflict.json().code, "ACCOUNT_LINK_CONFLICT");
        assert.deepEqual(h.snapshot(), before2);
      }),
  );
  record(
    `${engine}: staff invitations cannot use legacy bearer or Google manager callback`,
    () =>
      fixture(engine, async (h) => {
        const invite = await h.issue();
        for (const enabled of [false, true]) {
          const app = await buildApp(h.store, {
            ...h.options,
            merchantGoogle: { enabled, clientId: "fixture-google" },
          });
          try {
            const r = await app.inject({
              method: "POST",
              url: "/auth/invitations/redeem",
              headers: { origin: "https://merchant.test" },
              payload: { token: invite.invitationToken },
            });
            assert.equal(r.statusCode, 403);
            assert.equal(r.json().code, "LINE_STAFF_REQUIRED");
          } finally {
            await app.close();
          }
        }
        const google = new MerchantGoogleAuth(h.store);
        assert.throws(() => google.challenge(invite.invitationToken), {
          code: "LINE_STAFF_REQUIRED",
        });
        const googleBefore = h.db
          .prepare(
            "SELECT * FROM account_external_identities WHERE provider='google'",
          )
          .all();
        await h.logged();
        assert.deepEqual(
          h.db
            .prepare(
              "SELECT * FROM account_external_identities WHERE provider='google'",
            )
            .all(),
          googleBefore,
        );
      }),
  );
  record(
    `${engine}: login mutations rollback together and no transaction leaks`,
    () =>
      fixture(engine, async (h) => {
        const invite = await h.issue();
        for (const pattern of [
          /^INSERT INTO account_external_identities/,
          /^UPDATE account_invitations/,
          /^INSERT INTO account_sessions/,
          /^INSERT INTO merchant_staff_sessions/,
          /^UPDATE merchant_staff_challenges SET consumed_at/,
          /^INSERT INTO audit_events/,
        ]) {
          const c = await h.start(invite.invitationToken),
            before = h.snapshot(),
            prepare = h.db.prepare.bind(h.db);
          let fired = false;
          h.db.prepare = (sql) => {
            const stmt = prepare(sql);
            return {
              ...stmt,
              run: (...args) => {
                const r = stmt.run(...args);
                if (!fired && pattern.test(sql)) {
                  fired = true;
                  throw Error("AUTH01B_AFTER_WRITE_FAILURE");
                }
                return r;
              },
            };
          };
          try {
            assert.equal((await h.login(c)).statusCode, 500);
          } finally {
            h.db.prepare = prepare;
          }
          assert.ok(fired, String(pattern));
          assert.deepEqual(h.snapshot(), before);
          h.db.exec("BEGIN IMMEDIATE");
          h.db.exec("ROLLBACK");
        }
      }),
  );
  record(`${engine}: D1 profile initialization rollback at each write`, () =>
    fixture(engine, async (h) => {
      await h.logged();
      for (const pattern of [
        /^INSERT INTO users/,
        /^INSERT INTO user_resources/,
        /^INSERT INTO user_growth_balances/,
        /^INSERT INTO account_sessions/,
        /^INSERT INTO audit_events/,
      ]) {
        const before = h.snapshot(),
          prepare = h.db.prepare.bind(h.db);
        let fired = false;
        h.db.prepare = (sql) => {
          const stmt = prepare(sql);
          return {
            ...stmt,
            run: (...args) => {
              const r = stmt.run(...args);
              if (!fired && pattern.test(sql)) {
                fired = true;
                throw Error("D1_AFTER_WRITE_FAILURE");
              }
              return r;
            },
          };
        };
        try {
          assert.throws(
            () => h.session("staff-line"),
            /D1_AFTER_WRITE_FAILURE/,
          );
        } finally {
          h.db.prepare = prepare;
        }
        assert.ok(fired);
        assert.deepEqual(h.snapshot(), before);
      }
    }),
  );
  record(
    `${engine}: returning staff login, same-account player-first, logout CSRF and revocation`,
    () =>
      fixture(engine, async (h) => {
        const first = await h.logged();
        const c = await h.start(undefined, h.one.profile.id);
        assert.equal((await h.login(c)).statusCode, 200);
        assert.equal(
          (
            await h.request(
              "POST",
              "/auth/logout",
              {},
              first.cookie,
              "https://evil.test",
            )
          ).statusCode,
          403,
        );
        assert.equal(
          (await h.request("POST", "/auth/logout", {}, first.cookie))
            .statusCode,
          200,
        );
        assert.equal(
          (await h.request("GET", "/merchant/context", undefined, first.cookie))
            .statusCode,
          401,
        );
        const player = h.session("player-first");
        const member = h.store.createMerchantOperatorMembership({
          accountId: player.auth.context.accountId,
          brandId: h.one.profile.brandId,
          merchantId: h.one.profile.id,
          role: "branch_staff",
          actorId: "fixture",
        }).membership;
        const invite = h.auth.issueInvitation(
          member.membershipId,
          h.admin.accountId,
          "player-first-invite",
        );
        const next = await h.start(invite.invitationToken);
        assert.equal((await h.login(next, "player-first")).statusCode, 200);
        assert.equal(h.session("player-first").id, player.id);
      }),
  );
  record(
    `${engine}: legacy redemption is 410 without records for every credential`,
    () =>
      fixture(engine, async (h) => {
        const staff = await h.logged();
        for (const headers of [
          {},
          { "x-looper-role": "merchant" },
          { cookie: staff.cookie },
          { cookie: h.admin.cookie },
        ]) {
          const r = await h.app.inject({
            method: "GET",
            url: "/merchant/redemptions",
            headers,
          });
          assert.equal(r.statusCode, 410);
          assert.deepEqual(Object.keys(r.json()).sort(), ["code", "message"]);
          assert.equal(r.json().code, "LEGACY_REDEMPTION_READ_GONE");
        }
      }),
  );
}
for (const engine of ["sqlite", "postgres"]) {
  record(
    `${engine}: COMMIT outcome unknown preserves correlation and does not retry`,
    () =>
      fixture(engine, async (h) => {
        const invite = await h.issue(),
          c = await h.start(invite.invitationToken),
          exec = h.db.exec.bind(h.db),
          close = h.db.close.bind(h.db);
        let fired = false,
          closed = 0;
        h.db.close = () => {
          closed++;
        };
        h.db.exec = (sql) => {
          const result = exec(sql);
          if (!fired && /^COMMIT$/.test(sql)) {
            fired = true;
            throw Error("lost commit reply");
          }
          return result;
        };
        let response;
        try {
          response = await h.login(c);
        } finally {
          h.db.exec = exec;
          h.db.close = close;
        }
        assert.equal(response.statusCode, 503);
        assert.equal(response.json().code, "STAFF_COMMIT_OUTCOME_UNKNOWN");
        assert.equal(response.json().operationId, hash(c.state));
        assert.equal(closed, 1);
        const durable = h.db
          .prepare("SELECT * FROM merchant_staff_challenges WHERE state_hash=?")
          .get(hash(c.state));
        assert.ok(durable.consumed_at);
        assert.ok(durable.session_id);
        assert.equal(
          h.db.prepare("SELECT count(*) n FROM merchant_staff_sessions").get()
            .n,
          1,
        );
        assert.equal((await h.login(c)).statusCode, 403);
        assert.equal(
          h.db.prepare("SELECT count(*) n FROM merchant_staff_sessions").get()
            .n,
          1,
        );
      }),
  );
  record(
    `${engine}: missing companion cannot downgrade and disabled flag denies existing staff`,
    () =>
      fixture(engine, async (h) => {
        const logged = await h.logged();
        const off = await buildApp(h.store, {
          ...h.options,
          merchantStaff: {
            enabled: false,
            channelId: channel,
            playerChannelId: channel,
          },
        });
        try {
          assert.equal(
            (
              await off.inject({
                method: "GET",
                url: "/merchant/context",
                headers: { cookie: logged.cookie },
              })
            ).statusCode,
            403,
          );
        } finally {
          await off.close();
        }
        const session = h.db
          .prepare("SELECT session_id FROM merchant_staff_sessions")
          .get().session_id;
        h.db
          .prepare(
            "UPDATE merchant_staff_challenges SET session_id=NULL WHERE session_id=?",
          )
          .run(session);
        h.db
          .prepare("DELETE FROM merchant_staff_sessions WHERE session_id=?")
          .run(session);
        assert.equal(
          (
            await h.request(
              "GET",
              "/merchant/context",
              undefined,
              logged.cookie,
            )
          ).statusCode,
          403,
        );
      }),
  );
  record(
    `${engine}: valid Google manager retains aggregate scope and cannot reuse staff provenance`,
    () =>
      fixture(engine, async (h) => {
        h.store.createMerchantOperatorMembership({
          accountId: h.accountId,
          brandId: h.two.profile.brandId,
          role: "brand_owner",
          actorId: "fixture",
        });
        const managerInvite = h.store.createAccountInvitation({
          accountId: h.accountId,
          actorId: h.admin.accountId,
          idempotencyKey: "manager-invitation",
          merchantAppBaseUrl: "https://merchant.test",
        });
        const google = new MerchantGoogleAuth(h.store);
        const gc = google.challenge(managerInvite.invitationToken);
        const manager = google.login(gc.state, gc.browser, {
          subject: "google-manager",
          nonce: gc.nonce,
        });
        const before = plain(
          h.db
            .prepare(
              "SELECT * FROM account_external_identities WHERE provider='google'",
            )
            .all(),
        );
        await h.logged();
        assert.deepEqual(
          plain(
            h.db
              .prepare(
                "SELECT * FROM account_external_identities WHERE provider='google'",
              )
              .all(),
          ),
          before,
        );
        const returned = google.challenge();
        const next = google.login(returned.state, returned.browser, {
          subject: "google-manager",
          nonce: returned.nonce,
        });
        const session = h.store.resolveSessionToken(next.sessionToken);
        assert.equal(
          resolveStaffScope(h.db, session.sessionId, h.accountId),
          null,
        );
        assert.equal(
          (
            await h.request(
              "GET",
              `/merchant/task-code-submissions?merchantId=${h.two.profile.id}`,
              undefined,
              `looper_session=${manager.sessionToken}`,
            )
          ).statusCode,
          200,
        );
      }),
  );
  for (const mode of ["redeem", "same-challenge", "player"])
    record(
      `${engine}: independent connections concurrently ${mode} exactly once`,
      () =>
        fixture(engine, async (h) => {
          const challenges = [];
          if (mode === "player") await h.logged();
          else {
            const invite = await h.issue();
            for (let n = 0; n < 2; n++) {
              const c = await h.start(invite.invitationToken);
              challenges.push({
                state: c.state,
                browser: c.cookie.split("=")[1],
                nonceHash: hash(c.nonce),
              });
            }
          }
          if (mode === "same-challenge") challenges[1] = challenges[0];
          const file = resolve(
            `${out}/race-${process.pid}-${seq}-${mode}.sqlite`,
          );
          let observer = h.db;
          const workers = [],
            ready = [],
            done = [],
            gate = new SharedArrayBuffer(4);
          let locked = false;
          try {
            if (engine === "sqlite") {
              assert.equal(existsSync(file), false);
              h.db.prepare("VACUUM INTO ?").run(file);
              observer = new DatabaseSync(file);
              // COMMIT must wait for competing readers just like the worker connections.
              configureDatabase(observer);
            }
            for (let n = 0; n < 2; n++) {
              const worker = new Worker(
                new URL("./auth01b-race-worker.mjs", import.meta.url),
                {
                  workerData: {
                    engine,
                    credentials:
                      engine === "postgres" ? credentials() : undefined,
                    schema: `w1b_${h.name}`,
                    path: file,
                    channel,
                    gate,
                    mode,
                    challenge: challenges[n],
                  },
                },
              );
              workers.push(worker);
              ready.push(
                new Promise((resolve, reject) => {
                  worker.on("message", (m) => {
                    if (m.ready) resolve(m);
                    if (m.done && !m.ready && m.status !== 200)
                      reject(Error(JSON.stringify(m)));
                  });
                  worker.on("error", reject);
                }),
              );
              done.push(
                new Promise((resolve, reject) => {
                  worker.on("message", (m) => {
                    if (m.done) resolve(m);
                  });
                  worker.on("error", reject);
                }),
              );
            }
            const clients = await Promise.all(ready);
            assert.equal(new Set(clients.map((x) => x.id)).size, 2);
            observer.exec("BEGIN IMMEDIATE");
            locked = true;
            Atomics.store(new Int32Array(gate), 0, 1);
            Atomics.notify(new Int32Array(gate), 0, 2);
            if (engine === "postgres") {
              let waiters = 0;
              for (let n = 0; n < 150; n++) {
                waiters = Number(
                  observer
                    .prepare(
                      "SELECT count(*) n FROM pg_stat_activity WHERE pid IN (?,?) AND wait_event='advisory'",
                    )
                    .get(clients[0].id, clients[1].id).n,
                );
                if (waiters === 2) break;
                await new Promise((r) => setTimeout(r, 20));
              }
              assert.equal(waiters, 2);
            } else await new Promise((r) => setTimeout(r, 100));
            observer.exec("COMMIT");
            locked = false;
            const responses = await Promise.all(done);
            assert.deepEqual(
              responses.map((x) => x.status).sort(),
              mode === "player"
                ? [200, 200]
                : mode === "same-challenge"
                  ? [200, 403]
                  : [200, 409],
              JSON.stringify(responses),
            );
            if (mode === "player") {
              assert.equal(new Set(responses.map((x) => x.userId)).size, 1);
              assert.equal(responses[0].accountId, h.accountId);
              assert.equal(
                observer
                  .prepare("SELECT count(*) n FROM users WHERE account_id=?")
                  .get(h.accountId).n,
                1,
              );
            } else
              assert.equal(
                observer
                  .prepare(
                    "SELECT count(*) n FROM merchant_staff_sessions WHERE account_id=?",
                  )
                  .get(h.accountId).n,
                1,
              );
          } finally {
            if (locked) observer.exec("ROLLBACK");
            for (const w of workers) await w.terminate();
            if (engine === "sqlite") {
              observer.close();
              for (const suffix of ["", "-wal", "-shm"])
                if (existsSync(file + suffix)) unlinkSync(file + suffix);
            }
          }
        }),
    );
}
record(
  "SQLite / PostgreSQL successful staff-first Player initialization parity",
  async () => {
    const values = [];
    for (const engine of ["sqlite", "postgres"])
      await fixture(engine, async (h) => {
        await h.logged();
        const player = h.session("staff-line");
        const resource = plain(
          h.db
            .prepare("SELECT * FROM user_resources WHERE user_id=?")
            .get(player.id),
        );
        const growth = plain(
          h.db
            .prepare("SELECT * FROM user_growth_balances WHERE user_id=?")
            .get(player.id),
        );
        for (const value of [resource, growth])
          for (const key of ["user_id", "updated_at", "energy_last_updated_at"])
            delete value[key];
        values.push({ resource, growth });
      });
    assert.deepEqual(values[0], values[1]);
  },
);

for (const engine of ["sqlite", "postgres"])
  record(
    `${engine}: invitation issuance audit failure and expired challenge preserve all data`,
    () =>
      fixture(engine, async (h) => {
        const before = h.snapshot(),
          prepare = h.db.prepare.bind(h.db);
        let fired = false;
        h.db.prepare = (sql) => {
          const stmt = prepare(sql);
          return {
            ...stmt,
            run: (...args) => {
              const r = stmt.run(...args);
              if (!fired && /^INSERT INTO audit_events/.test(sql)) {
                fired = true;
                throw Error("STAFF_ISSUE_AUDIT_FAILURE");
              }
              return r;
            },
          };
        };
        try {
          const response = await h.request(
            "POST",
            "/admin/staff-invitations",
            {
              membershipId: h.membership.membershipId,
              idempotencyKey: "issue-rollback-key",
            },
            h.admin.cookie,
            "https://admin.test",
          );
          assert.equal(response.statusCode, 500);
        } finally {
          h.db.prepare = prepare;
        }
        assert.ok(fired);
        assert.deepEqual(h.snapshot(), before);
        const invite = await h.issue(),
          c = await h.start(invite.invitationToken);
        h.db
          .prepare(
            "UPDATE merchant_staff_challenges SET expires_at='2000-01-01' WHERE state_hash=?",
          )
          .run(hash(c.state));
        const expired = h.snapshot();
        assert.equal((await h.login(c)).statusCode, 403);
        assert.deepEqual(h.snapshot(), expired);
      }),
  );

test.after(() => {
  writeFileSync(
    `${out}/AUTH01B_TEST_RESULTS.json`,
    JSON.stringify(
      {
        head: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim(),
        kind: "NEW_AUTH01B_ACCEPTANCE_NOT_PREFLIGHT",
        passed: results.length,
        results,
      },
      null,
      2,
    ),
  );
});
