import assert from "node:assert/strict";
import test from "node:test";
import { configuredLinePlayerIdentityVerifier, LinePlayerIdentityVerifier } from "./player-identity.js";

function verifierResponse(payload: object, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } })) as typeof fetch;
}

test("player canonical session LINE verifier accepts a valid official response", async () => {
  const verifier = new LinePlayerIdentityVerifier({
    channelId: "channel-1",
    fetcher: verifierResponse({ sub: "line-subject", name: " LINE 玩家 ", aud: "channel-1", iss: "https://access.line.me", exp: Math.floor(Date.now() / 1000) + 300 }),
  });
  assert.deepEqual(await verifier.verifyIdToken("opaque-id-token"), { provider: "line", providerSubject: "line-subject", displayName: "LINE 玩家" });
});

test("player canonical session LINE verifier rejects invalid expired audience and issuer responses", async () => {
  const cases = [
    verifierResponse({ error: "invalid_request" }, 400),
    verifierResponse({ sub: "subject", aud: "wrong", iss: "https://access.line.me", exp: Math.floor(Date.now() / 1000) + 300 }),
    verifierResponse({ sub: "subject", aud: "channel-1", iss: "wrong", exp: Math.floor(Date.now() / 1000) + 300 }),
    verifierResponse({ sub: "subject", aud: "channel-1", iss: "https://access.line.me", exp: Math.floor(Date.now() / 1000) - 1 }),
  ];
  for (const fetcher of cases) {
    const verifier = new LinePlayerIdentityVerifier({ channelId: "channel-1", fetcher });
    await assert.rejects(() => verifier.verifyIdToken("invalid"), (error: Error & { statusCode?: number }) => error.statusCode === 401);
  }
});

test("player canonical session LINE verifier distinguishes timeout and missing configuration", async () => {
  const verifier = new LinePlayerIdentityVerifier({ channelId: "channel-1", fetcher: (async () => { throw new Error("timeout"); }) as typeof fetch });
  await assert.rejects(() => verifier.verifyIdToken("token"), (error: Error & { statusCode?: number }) => error.statusCode === 503);
  assert.equal(configuredLinePlayerIdentityVerifier({}), null);
});
