import assert from "node:assert/strict";
import test from "node:test";
import { authenticatedPlayerRequest, clearProtectedPlayerStorage, loadPlayerSession, obtainVerifiedLiffCredential, playerMutationRequest } from "./player-session-flow";

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

test("player session flow obtains only an ID token from initialized LIFF", async () => {
  const calls: string[] = [];
  const token = await obtainVerifiedLiffCredential({
    async init({ liffId }) { calls.push(liffId); },
    isLoggedIn() { return true; },
    login() { calls.push("login"); },
    getIDToken() { return "verified-id-token"; },
  }, "liff-1");
  assert.equal(token, "verified-id-token");
  assert.deepEqual(calls, ["liff-1"]);
});

test("player session flow never falls back to user-demo", () => {
  const source = [authenticatedPlayerRequest, playerMutationRequest, clearProtectedPlayerStorage, loadPlayerSession, obtainVerifiedLiffCredential]
    .map((value) => String(value)).join("\n");
  assert.equal(source.includes("user-demo"), false);
});
