import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { randomBytes, createHash } from "node:crypto";
import {
  harness,
  merchant,
  plain,
  credentials,
} from "../apps/api/test-parity/fixtures.ts";
import { Worker } from "node:worker_threads";
import { buildApp } from "../apps/api/src/app.ts";
import { migrateMerchantGoogle } from "../apps/api/src/merchant-google-schema.ts";
import { MerchantGoogleAuth } from "../apps/api/src/merchant-google-auth.ts";
import { GoogleMerchantVerifier } from "../apps/api/src/merchant-google-verifier.ts";
const require = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT, errors } =
  await import(pathToFileURL(require.resolve("jose")).href);
const keys = await generateKeyPair("RS256");
const wrong = await generateKeyPair("RS256");
const jwk = {
  ...(await exportJWK(keys.publicKey)),
  kid: "ephemeral-test-key",
  alg: "RS256",
};
const clientId = "auth01a-test.apps.googleusercontent.com";
const verifier = new GoogleMerchantVerifier(
  clientId,
  createLocalJWKSet({ keys: [jwk] }),
);
const opaque = () => randomBytes(32).toString("base64url");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const results = {
  verifier: [],
  schema: [],
  binding: [],
  security: [],
  rollback: [],
  concurrency: [],
};
async function token(nonce, overrides = {}, key = keys.privateKey) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sub: "google-subject",
    nonce,
    aud: clientId,
    iss: "https://accounts.google.com",
    iat: now,
    exp: now + 300,
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .sign(key);
}
for (const [name, overrides, key, valid] of [
  ["valid", {}, undefined, true],
  ["alternate issuer", { iss: "accounts.google.com" }, undefined, true],
  ["wrong signature", {}, wrong.privateKey],
  ["wrong issuer", { iss: "https://evil.test" }],
  ["wrong audience", { aud: "other-client" }],
  ["expired", { exp: 1 }],
  ["missing subject", { sub: undefined }],
  ["empty subject", { sub: " " }],
  ["missing nonce", { nonce: undefined }],
  ["future issued", { iat: 9999999999 }],
  ["wrong authorized party", { azp: "other-client" }],
])
  test(`Google verifier: ${name}`, async () => {
    const credential = await token(opaque(), overrides, key);
    if (valid)
      assert.equal(
        (await verifier.verify(credential)).subject,
        "google-subject",
      );
    else
      await assert.rejects(verifier.verify(credential), {
        code: "GOOGLE_INVALID_TOKEN",
      });
    results.verifier.push({ name, pass: true });
  });
test("Google verifier: malformed/unsigned tokens and provider outage fail closed", async () => {
  for (const credential of ["invalid", "eyJhbGciOiJub25lIn0.e30."])
    await assert.rejects(verifier.verify(credential), {
      code: "GOOGLE_INVALID_TOKEN",
    });
  const unavailable = new GoogleMerchantVerifier(clientId, async () => {
    throw new errors.JWKSTimeout();
  });
  await assert.rejects(unavailable.verify(await token(opaque())), {
    code: "GOOGLE_PROVIDER_UNAVAILABLE",
    statusCode: 503,
  });
  results.verifier.push({
    name: "malformed/unsigned/provider outage",
    pass: true,
  });
});

let seq = 0;
async function fixture(engine, fn) {
  const name = `auth01a_${process.pid}_${++seq}`,
    h = await harness(engine, name);
  let app;
  try {
    h.session("line-before-google-migration");
    const before = plain(
      h.db.prepare("SELECT * FROM account_external_identities").all(),
    );
    migrateMerchantGoogle(h.db, engine);
    migrateMerchantGoogle(h.db, engine);
    assert.deepEqual(
      plain(h.db.prepare("SELECT * FROM account_external_identities").all()),
      before,
    );
    const m = merchant(h, `auth-${seq}`).profile;
    const account = h.store.createAccount({
      displayName: "測試店家",
      idempotencyKey: `account-${seq}`,
      actorId: "test-admin",
    }).account;
    h.store.createMerchantOperatorMembership({
      accountId: account.accountId,
      brandId: m.brandId,
      merchantId: m.id,
      role: "branch_manager",
      idempotencyKey: `member-${seq}`,
      actorId: "test-admin",
    });
    const invite = h.store.createAccountInvitation({
      accountId: account.accountId,
      idempotencyKey: `invite-${seq}`,
      actorId: "test-admin",
      merchantAppBaseUrl: "https://merchant.test",
    });
    app = await buildApp(h.store, {
      production: false,
      merchantAppUrl: "https://merchant.test",
      adminAppUrl: "https://admin.test",
      merchantGoogle: { enabled: true, clientId, verifier },
    });
    await app.ready();
    const service = new MerchantGoogleAuth(h.store);
    const api = (
      url,
      body,
      cookie,
      origin = "https://merchant.test",
      method = "POST",
    ) =>
      app.inject({
        method,
        url,
        payload: body,
        headers: { origin, ...(cookie ? { cookie } : {}) },
      });
    const start = async (invitationToken) => {
      const response = await api(
        "/auth/merchant/google/challenge",
        invitationToken ? { invitationToken } : {},
      );
      assert.equal(response.statusCode, 200, response.body);
      return {
        ...response.json(),
        cookie: response.headers["set-cookie"].split(";")[0],
      };
    };
    const login = async (challenge, overrides) =>
      api(
        "/auth/merchant/google/session",
        {
          state: challenge.state,
          credential: await token(challenge.nonce, overrides),
        },
        challenge.cookie,
      );
    await fn({
      ...h,
      app,
      service,
      api,
      start,
      login,
      accountId: account.accountId,
      invite,
      merchant: m,
      engine,
      schema: `w1b_${name}`,
    });
  } finally {
    await app?.close();
    if (engine === "postgres") {
      h.db.exec(`DROP SCHEMA "w1b_${name}" CASCADE`);
      h.db
        .prepare("DELETE FROM w1b_control.queue_counters WHERE schema_name=?")
        .run(`w1b_${name}`);
    }
    await h.close();
  }
}
const tables = [
  "accounts",
  "account_external_identities",
  "account_invitations",
  "account_sessions",
  "audit_events",
  "merchant_google_challenges",
];
const snapshot = (h) =>
  Object.fromEntries(
    tables.map((table) => [
      table,
      plain(h.db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()),
    ]),
  );
for (const engine of ["sqlite", "postgres"]) {
  test(`${engine}: first binding, returning account, provenance, LINE preservation and schema constraints`, async () =>
    fixture(engine, async (h) => {
      const player = h.session("line-still-works");
      const before = snapshot(h);
      const c = await h.start(h.invite.invitationToken),
        first = await h.login(c);
      assert.equal(first.statusCode, 200, first.body);
      assert.equal(first.json().account.accountId, h.accountId);
      const returning = await h.login(await h.start());
      assert.equal(returning.statusCode, 200, returning.body);
      assert.equal(returning.json().account.accountId, h.accountId);
      assert.equal(
        h.db.prepare("SELECT COUNT(*) AS n FROM accounts").get().n,
        before.accounts.length,
      );
      assert.equal(
        h.db
          .prepare(
            "SELECT COUNT(*) AS n FROM account_external_identities WHERE provider='google'",
          )
          .get().n,
        1,
      );
      assert.ok(
        h.store.getPlayerSessionContext(player.auth.sessionToken, false),
      );
      assert.equal(
        h.db
          .prepare(
            "SELECT COUNT(*) AS n FROM account_sessions WHERE purpose='merchant_operator' AND created_from_invitation_id=?",
          )
          .get(h.invite.invitationId).n,
        2,
      );
      assert.equal(
        h.db
          .prepare(
            "SELECT COUNT(*) AS n FROM audit_events WHERE action='identity.google_merchant_session_created'",
          )
          .get().n,
        2,
      );
      assert.throws(() =>
        h.db
          .prepare(
            "INSERT INTO account_external_identities(id,account_id,provider,provider_subject,created_at,updated_at) VALUES ('bad',?,'apple','x','x','x')",
          )
          .run(h.accountId),
      );
      results.schema.push({
        engine,
        extensionVersion: 28,
        idempotent: true,
        linePreserved: true,
        unknownProviderRejected: true,
      });
      results.binding.push({
        engine,
        first: true,
        returningSameAccount: true,
        invitationProvenance: true,
        auditCount: 2,
      });
    }));
  test(`${engine}: CSRF, origin, state, nonce, expiration and replay`, async () =>
    fixture(engine, async (h) => {
      const c = await h.start(h.invite.invitationToken);
      const body = { state: c.state, credential: await token(c.nonce) };
      const before = snapshot(h);
      for (const [name, b, cookie, origin] of [
        ["missing cookie", body, undefined],
        ["wrong browser", body, `looper_google_challenge=${opaque()}`],
        ["wrong state", { ...body, state: opaque() }, c.cookie],
        ["wrong origin", body, c.cookie, "https://evil.test"],
        ["missing origin", body, c.cookie, ""],
        [
          "wrong nonce",
          { ...body, credential: await token(opaque()) },
          c.cookie,
        ],
      ]) {
        assert.equal(
          (await h.api("/auth/merchant/google/session", b, cookie, origin))
            .statusCode,
          403,
          name,
        );
        assert.deepEqual(snapshot(h), before);
        results.security.push({ engine, name, pass: true });
      }
      h.db
        .prepare(
          "UPDATE merchant_google_challenges SET expires_at='2000-01-01'",
        )
        .run();
      assert.equal((await h.login(c)).statusCode, 403);
      const c2 = await h.start(h.invite.invitationToken);
      assert.equal((await h.login(c2)).statusCode, 200);
      assert.equal((await h.login(c2)).statusCode, 403);
      results.security.push({ engine, name: "expiry and replay", pass: true });
    }));
  test(`${engine}: invalid credentials cannot mutate authority and client claims cannot grant access`, async () =>
    fixture(engine, async (h) => {
      const c = await h.start(h.invite.invitationToken),
        before = snapshot(h);
      for (const credential of [
        "invalid",
        await token(c.nonce, { exp: 1 }),
        await token(c.nonce, {}, wrong.privateKey),
      ]) {
        assert.equal(
          (
            await h.api(
              "/auth/merchant/google/session",
              { state: c.state, credential },
              c.cookie,
            )
          ).statusCode,
          401,
        );
        assert.deepEqual(snapshot(h), before);
      }
      const response = await h.api(
        "/auth/merchant/google/session",
        {
          state: c.state,
          credential: await token(c.nonce),
          accountId: "user-demo",
          role: "super_admin",
          merchantId: "forged",
        },
        c.cookie,
      );
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().account.accountId, h.accountId);
      assert.equal(
        h.store.isPlatformOperatorSession(response.json().account.sessionId),
        false,
      );
      results.security.push({
        engine,
        name: "invalid credentials no writes; spoofed account/role ignored",
        pass: true,
      });
    }));
  test(`${engine}: outer rollback preserves auth atomicity and uncertain release is not claimed rollback`, async () =>
    fixture(engine, async (h) => {
      const c = h.service.challenge(h.invite.invitationToken),
        before = snapshot(h);
      h.db.exec("BEGIN IMMEDIATE");
      h.service.login(c.state, c.browser, {
        subject: "nested-subject",
        nonce: c.nonce,
      });
      h.db.exec("ROLLBACK");
      assert.deepEqual(snapshot(h), before);
      // Simulate a successful durable COMMIT followed by a lost acknowledgement.
      const originalExec = h.db.exec.bind(h.db),
        originalClose = h.db.close.bind(h.db);
      let closed = false;
      h.db.exec = (sql) => {
        originalExec(sql);
        if (sql.startsWith("RELEASE SAVEPOINT merchant_google_"))
          throw Error("ACK_LOST");
      };
      h.db.close = () => {
        closed = true;
      };
      try {
        assert.throws(
          () =>
            h.service.login(c.state, c.browser, {
              subject: "nested-subject",
              nonce: c.nonce,
            }),
          { code: "GOOGLE_COMMIT_OUTCOME_UNKNOWN" },
        );
        assert.equal(closed, true);
      } finally {
        h.db.exec = originalExec;
        h.db.close = originalClose;
      }
      assert.equal(
        h.db
          .prepare(
            "SELECT COUNT(*) AS n FROM account_sessions WHERE purpose='merchant_operator'",
          )
          .get().n,
        1,
      );
      assert.throws(
        () =>
          h.service.login(c.state, c.browser, {
            subject: "nested-subject",
            nonce: c.nonce,
          }),
        { code: "GOOGLE_CHALLENGE_EXPIRED_OR_REPLAYED" },
      );
      results.rollback.push({
        engine,
        boundary: "outer rollback",
        allTablesRolledBack: true,
      });
      results.security.push({
        engine,
        name: "unknown outcome closes connection; durable challenge prevents replay",
        pass: true,
      });
    }));
  test(`${engine}: opt-in bearer bypass denied; platform and cross-branch isolation`, async () =>
    fixture(engine, async (h) => {
      assert.equal(
        (
          await h.api("/auth/invitations/redeem", {
            token: h.invite.invitationToken,
          })
        ).statusCode,
        403,
      );
      const response = await h.login(await h.start(h.invite.invitationToken));
      const cookie = response.headers["set-cookie"][0].split(";")[0];
      assert.equal(
        (await h.api("/merchant/context", undefined, cookie, undefined, "GET"))
          .statusCode,
        200,
      );
      const other = merchant(h, "other-branch").profile;
      assert.equal(
        (
          await h.api(
            `/merchant/task-code/current?merchantId=${other.id}`,
            undefined,
            cookie,
            undefined,
            "GET",
          )
        ).statusCode,
        403,
      );
      assert.equal(
        (
          await h.api(
            "/admin/platform-operators",
            undefined,
            cookie,
            "https://admin.test",
            "GET",
          )
        ).statusCode,
        403,
      );
      const platformToken = opaque(),
        now = new Date().toISOString();
      h.db
        .prepare(
          "INSERT INTO platform_operator_memberships(id,account_id,role,status,created_at,updated_at) VALUES ('test-platform',?,'operations_admin','active',?,?)",
        )
        .run(h.accountId, now, now);
      h.db
        .prepare(
          "INSERT INTO account_invitations(id,account_id,purpose,token_hash,status,expires_at,created_by_actor_id,creation_idempotency_key,created_at,updated_at) VALUES ('platform-invite',?,'platform_operator',?,'pending',?,'test','platform-key',?,?)",
        )
        .run(
          h.accountId,
          hash(platformToken),
          new Date(Date.now() + 60000).toISOString(),
          now,
          now,
        );
      assert.equal(
        (
          await h.api(
            "/auth/invitations/redeem",
            { token: platformToken },
            undefined,
            "https://admin.test",
          )
        ).statusCode,
        200,
      );
      h.db
        .prepare(
          "UPDATE merchant_operator_memberships SET status='suspended' WHERE account_id=?",
        )
        .run(h.accountId);
      assert.equal(
        (await h.api("/merchant/context", undefined, cookie, undefined, "GET"))
          .statusCode,
        403,
      );
      assert.equal((await h.login(await h.start())).statusCode, 403);
      results.security.push({
        engine,
        name: "bearer bypass/cross-branch/platform/revocation",
        pass: true,
      });
    }));
  test(`${engine}: subject conflicts and same email never merge accounts`, async () =>
    fixture(engine, async (h) => {
      assert.equal(
        (
          await h.login(await h.start(h.invite.invitationToken), {
            email: "same@example.test",
          })
        ).statusCode,
        200,
      );
      const c = await h.start();
      assert.equal(
        (
          await h.login(c, {
            sub: "different-subject",
            email: "same@example.test",
          })
        ).statusCode,
        403,
      );
      const next = h.store.createAccountInvitation({
        accountId: h.accountId,
        idempotencyKey: "next-invite",
        actorId: "test",
        merchantAppBaseUrl: "https://merchant.test",
      });
      assert.equal(
        (
          await h.login(await h.start(next.invitationToken), {
            sub: "different-subject",
          })
        ).statusCode,
        409,
      );
      const other = h.store.createAccount({
        displayName: "Other",
        idempotencyKey: "other-account",
        actorId: "test",
      }).account;
      h.store.createMerchantOperatorMembership({
        accountId: other.accountId,
        brandId: h.merchant.brandId,
        merchantId: h.merchant.id,
        role: "branch_manager",
        actorId: "test",
        idempotencyKey: "other-membership",
      });
      const invite = h.store.createAccountInvitation({
        accountId: other.accountId,
        idempotencyKey: "other-invite",
        actorId: "test",
        merchantAppBaseUrl: "https://merchant.test",
      });
      assert.equal(
        (await h.login(await h.start(invite.invitationToken))).statusCode,
        409,
      );
      results.security.push({
        engine,
        name: "duplicate subject/account binding/same email",
        pass: true,
      });
    }));
  test(`${engine}: expired/revoked invitation and inactive account/membership cannot bind`, async () =>
    fixture(engine, async (h) => {
      const original = h.db
        .prepare("SELECT * FROM account_invitations WHERE id=?")
        .get(h.invite.invitationId);
      for (const status of ["revoked", "redeemed"]) {
        h.db
          .prepare("UPDATE account_invitations SET status=? WHERE id=?")
          .run(status, h.invite.invitationId);
        assert.equal(
          (
            await h.api("/auth/merchant/google/challenge", {
              invitationToken: h.invite.invitationToken,
            })
          ).statusCode,
          409,
        );
      }
      h.db
        .prepare(
          "UPDATE account_invitations SET status='pending', expires_at='2000-01-01' WHERE id=?",
        )
        .run(h.invite.invitationId);
      assert.equal(
        (
          await h.api("/auth/merchant/google/challenge", {
            invitationToken: h.invite.invitationToken,
          })
        ).json().code,
        "INVITATION_EXPIRED",
      );
      h.db
        .prepare("UPDATE account_invitations SET expires_at=? WHERE id=?")
        .run(original.expires_at, h.invite.invitationId);
      const c = await h.start(h.invite.invitationToken);
      h.db
        .prepare(
          "UPDATE merchant_operator_memberships SET status='suspended' WHERE account_id=?",
        )
        .run(h.accountId);
      assert.equal((await h.login(c)).statusCode, 403);
      h.db
        .prepare(
          "UPDATE merchant_operator_memberships SET status='active' WHERE account_id=?",
        )
        .run(h.accountId);
      h.db
        .prepare("UPDATE accounts SET status='suspended' WHERE id=?")
        .run(h.accountId);
      assert.equal((await h.login(c)).statusCode, 401);
      results.security.push({
        engine,
        name: "invitation/account/membership invalidated during flow",
        pass: true,
      });
    }));
  test(`${engine}: every mutation boundary rolls back identity/invite/session/audit/challenge`, async () =>
    fixture(engine, async (h) => {
      for (const pattern of [
        /^INSERT INTO account_external_identities/,
        /^UPDATE account_invitations/,
        /^UPDATE merchant_google_challenges/,
        /^INSERT INTO account_sessions/,
        /^INSERT INTO audit_events/,
      ]) {
        const c = await h.start(h.invite.invitationToken),
          before = snapshot(h),
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
                throw Error("AUTH01A_INJECTED_AFTER_WRITE");
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
        assert.ok(fired);
        assert.deepEqual(snapshot(h), before);
        h.db.exec("BEGIN IMMEDIATE");
        h.db.exec("ROLLBACK");
        results.rollback.push({
          engine,
          boundary: String(pattern),
          allTablesRolledBack: true,
          noTransactionLeak: true,
        });
      }
    }));
  test(`${engine}: concurrent same challenge and separate challenges redeem once`, async () =>
    fixture(engine, async (h) => {
      const challenges = await Promise.all(
        Array.from({ length: 10 }, () => h.start(h.invite.invitationToken)),
      );
      const responses = await Promise.all(challenges.map((c) => h.login(c)));
      assert.equal(responses.filter((r) => r.statusCode === 200).length, 1);
      assert.equal(
        h.db
          .prepare(
            "SELECT COUNT(*) AS n FROM account_sessions WHERE purpose='merchant_operator'",
          )
          .get().n,
        1,
      );
      const c = await h.start();
      const repeated = await Promise.all(
        Array.from({ length: 10 }, () => h.login(c)),
      );
      assert.equal(repeated.filter((r) => r.statusCode === 200).length, 1);
      results.concurrency.push({
        engine,
        requests: 20,
        successfulInvitations: 1,
        successfulReturningChallenge: 1,
      });
    }));
}
test("PostgreSQL independent API connections contend on writer lock and redeem once", async () =>
  fixture("postgres", async (h) => {
    const gate = new SharedArrayBuffer(4),
      workers = [],
      ready = [],
      done = [];
    let locked = false;
    try {
      for (let i = 0; i < 2; i++) {
        const c = await h.start(h.invite.invitationToken);
        const worker = new Worker(
          new URL("./auth01a-race-worker.mjs", import.meta.url),
          {
            workerData: {
              credentials: credentials(),
              schema: h.schema,
              gate,
              clientId,
              jwk,
              request: {
                method: "POST",
                url: "/auth/merchant/google/session",
                headers: { origin: "https://merchant.test", cookie: c.cookie },
                payload: { state: c.state, credential: await token(c.nonce) },
              },
            },
          },
        );
        workers.push(worker);
        ready.push(
          new Promise((resolve, reject) => {
            worker.on("message", (m) => {
              if (m.ready) resolve(m);
              if (m.error) reject(Error(m.error));
            });
            worker.on("error", reject);
          }),
        );
        done.push(
          new Promise((resolve, reject) => {
            worker.on("message", (m) => {
              if (m.status) resolve(m.status);
              if (m.error) reject(Error(m.error));
            });
            worker.on("error", reject);
          }),
        );
      }
      const clients = await Promise.all(ready);
      assert.equal(new Set(clients.map((c) => c.pid)).size, 2);
      h.db.exec("BEGIN IMMEDIATE");
      locked = true;
      Atomics.store(new Int32Array(gate), 0, 1);
      Atomics.notify(new Int32Array(gate), 0, 2);
      let waiters = 0;
      for (let i = 0; i < 150; i++) {
        waiters = Number(
          h.db
            .prepare(
              "SELECT COUNT(*) AS n FROM pg_stat_activity WHERE pid IN (?,?) AND wait_event='advisory'",
            )
            .get(clients[0].pid, clients[1].pid).n,
        );
        if (waiters === 2) break;
        await new Promise((r) => setTimeout(r, 20));
      }
      assert.equal(waiters, 2);
      h.db.exec("COMMIT");
      locked = false;
      assert.deepEqual((await Promise.all(done)).sort(), [200, 409]);
      assert.equal(
        h.db
          .prepare(
            "SELECT COUNT(*) AS n FROM account_sessions WHERE purpose='merchant_operator'",
          )
          .get().n,
        1,
      );
      results.concurrency.push({
        engine: "postgres",
        independentConnections: 2,
        simultaneousWriterWaiters: 2,
        statuses: [200, 409],
        singleSession: true,
      });
    } finally {
      if (locked) h.db.exec("ROLLBACK");
      for (const worker of workers) await worker.terminate();
    }
  }));
test("Google configuration fails closed without schema/client/HTTPS or with production test verifier", async () => {
  const h = await harness("sqlite", `auth_config_${process.pid}`);
  try {
    await assert.rejects(
      buildApp(h.store, { merchantGoogle: { enabled: true, clientId: "" } }),
    );
    await assert.rejects(
      buildApp(h.store, {
        merchantAppUrl: "https://merchant.test",
        merchantGoogle: { enabled: true, clientId },
      }),
      /migration 28/,
    );
    for (const [url, v] of [
      ["http://merchant.test", undefined],
      ["https://merchant.test", verifier],
    ])
      await assert.rejects(
        buildApp(h.store, {
          production: true,
          playerAppUrl: "https://player.test",
          adminAppUrl: "https://admin.test",
          merchantAppUrl: url,
          merchantGoogle: { enabled: true, clientId, verifier: v },
        }),
        /Production Google/,
      );
    results.security.push({
      engine: "configuration",
      name: "missing schema/client/HTTPS and production injected verifier",
      pass: true,
    });
  } finally {
    await h.close();
  }
});
test.after(() => {
  const dir = "output/auth01a";
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    `${dir}/auth-tests.json`,
    JSON.stringify(
      {
        head: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim(),
        ...results,
      },
      null,
      2,
    ),
  );
});
