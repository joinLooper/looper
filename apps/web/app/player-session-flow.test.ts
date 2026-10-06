import assert from "node:assert/strict";
import test from "node:test";
import { authenticatedPlayerRequest, clearProtectedPlayerStorage, establishLinePlayerSession, LiffBootstrapError, loadPlayerSession, obtainVerifiedLiffCredential, playerMutationRequest, type LiffClient } from "./player-session-flow";

function liffClient(input: {
  inClient: boolean;
  loggedIn: boolean;
  token?: string | null;
  initError?: Error;
}) {
  const calls = { init: 0, login: 0, getIDToken: 0 };
  const client: LiffClient = {
    async init() {
      calls.init += 1;
      if (input.initError) throw input.initError;
    },
    isInClient() { return input.inClient; },
    isLoggedIn() { return input.loggedIn; },
    login() { calls.login += 1; },
    getIDToken() {
      calls.getIDToken += 1;
      return input.token ?? null;
    },
  };
  return { calls, client };
}

test("player session flow uses credentialed no-store requests without caller identity", () => {
  assert.deepEqual(authenticatedPlayerRequest, { credentials: "include", cache: "no-store" });
  const mutation = playerMutationRequest({ missionId: "mission-1" });
  assert.equal(mutation.credentials, "include");
  assert.equal(String(mutation.body).includes("userId"), false);
});

test("player session flow maps 401 to an unauthenticated gate", async () => {
  const fetcher = async () => new Response("{}", { status: 401 });
  assert.equal(await loadPlayerSession("https://api.test", fetcher as typeof fetch), null);
});

test("player session flow clears only protected player storage", () => {
  const values = new Map([
    ["looper.web.taskCodeSubmission.user-a", "x"],
    ["looper.web.playerEventResolution.user-a", "x"],
    ["looper.web.knowledgeCard.user-a", "x"],
    ["looper.ui.reduceMotion", "true"],
  ]);
  const storage = {
    get length() { return values.size; },
    key(index: number) { return [...values.keys()][index] ?? null; },
    removeItem(key: string) { values.delete(key); },
  };
  clearProtectedPlayerStorage(storage);
  assert.deepEqual([...values.keys()], ["looper.ui.reduceMotion"]);
});

test("LIFF Browser obtains the ID token without calling login", async () => {
  const { calls, client } = liffClient({ inClient: true, loggedIn: true, token: "verified-id-token" });
  const token = await obtainVerifiedLiffCredential(client, "liff-1");
  assert.equal(token, "verified-id-token");
  assert.deepEqual(calls, { init: 1, login: 0, getIDToken: 1 });
});

test("LIFF Browser reports unauthenticated without calling login", async () => {
  const { calls, client } = liffClient({ inClient: true, loggedIn: false });
  await assert.rejects(
    obtainVerifiedLiffCredential(client, "liff-1"),
    (error) => error instanceof LiffBootstrapError && error.diagnostic === "LIFF_BROWSER_NOT_AUTHENTICATED",
  );
  assert.deepEqual(calls, { init: 1, login: 0, getIDToken: 0 });
});

test("external browser starts exactly one LINE login redirect when logged out", async () => {
  const { calls, client } = liffClient({ inClient: false, loggedIn: false });
  assert.equal(await obtainVerifiedLiffCredential(client, "liff-1"), null);
  assert.deepEqual(calls, { init: 1, login: 1, getIDToken: 0 });
});

test("external browser obtains the ID token without login when already logged in", async () => {
  const { calls, client } = liffClient({ inClient: false, loggedIn: true, token: "verified-id-token" });
  assert.equal(await obtainVerifiedLiffCredential(client, "liff-1"), "verified-id-token");
  assert.deepEqual(calls, { init: 1, login: 0, getIDToken: 1 });
});

test("missing OpenID token fails explicitly without creating a Backend session", async () => {
  const { calls, client } = liffClient({ inClient: true, loggedIn: true, token: null });
  let backendSessionCalls = 0;
  await assert.rejects(
    establishLinePlayerSession("https://api.test", client, "liff-1", async () => {
      backendSessionCalls += 1;
      return new Response();
    }),
    (error) => error instanceof LiffBootstrapError && error.diagnostic === "LIFF_OPENID_TOKEN_UNAVAILABLE",
  );
  assert.equal(backendSessionCalls, 0);
  assert.deepEqual(calls, { init: 1, login: 0, getIDToken: 1 });
});

test("LIFF init failure does not mutate the Backend session", async () => {
  const { calls, client } = liffClient({ inClient: true, loggedIn: true, initError: new Error("private init detail") });
  let backendSessionCalls = 0;
  await assert.rejects(
    establishLinePlayerSession("https://api.test", client, "liff-1", async () => {
      backendSessionCalls += 1;
      return new Response();
    }),
    (error) => error instanceof LiffBootstrapError && error.diagnostic === "LIFF_INIT_FAILED",
  );
  assert.equal(backendSessionCalls, 0);
  assert.deepEqual(calls, { init: 1, login: 0, getIDToken: 0 });
});

test("player session flow never falls back to user-demo", () => {
  const source = [authenticatedPlayerRequest, playerMutationRequest, clearProtectedPlayerStorage, loadPlayerSession, obtainVerifiedLiffCredential, establishLinePlayerSession]
    .map((value) => String(value)).join("\n");
  assert.equal(source.includes("user-demo"), false);
});
