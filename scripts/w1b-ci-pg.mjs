// GitHub-hosted Linux CI only. Windows uses the official portable ZIP helpers.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const { Client } = require("pg");
if (
  process.platform !== "linux" ||
  process.env.GITHUB_ACTIONS !== "true" ||
  process.env.CI !== "true"
)
  throw Error("This helper is restricted to GitHub Linux CI");
const root = fileURLToPath(new URL("../", import.meta.url)),
  runtime = new URL("../.runtime/postgres17/", import.meta.url),
  name = "looper-w1b-parity-ci";
const image =
  "postgres:17.11-bookworm@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826";
const docker = (...args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
function existing() {
  try {
    return JSON.parse(docker("inspect", name))[0];
  } catch {
    return null;
  }
}
function stop() {
  const container = existing();
  if (!container) return;
  if (container.Config.Labels?.["looper.w1b.owner"] !== root)
    throw Error("Refusing to stop an unowned CI container");
  docker("stop", "--time", "20", name);
}
const action = process.argv[2];
if (action === "stop") {
  stop();
} else if (action === "start") {
  if (existing()) throw Error("Refusing to overwrite an existing CI container");
  mkdirSync(runtime, { recursive: true });
  const adminPassword = randomBytes(32).toString("hex"),
    password = randomBytes(32).toString("hex");
  const envfile = new URL("ci.env", runtime);
  writeFileSync(
    envfile,
    `POSTGRES_USER=w1b_bootstrap\nPOSTGRES_DB=postgres\nPOSTGRES_PASSWORD=${adminPassword}\nPOSTGRES_INITDB_ARGS=--encoding=UTF8 --locale=C\nTZ=UTC\n`,
    { mode: 0o600 },
  );
  docker(
    "run",
    "--detach",
    "--rm",
    "--name",
    name,
    "--label",
    `looper.w1b.owner=${root}`,
    "--env-file",
    fileURLToPath(envfile),
    "--network",
    "host",
    image,
    "-c",
    "listen_addresses=127.0.0.1",
    "-c",
    "port=55432",
  );
  try {
    let admin;
    for (let attempt = 0; attempt < 100; attempt++) {
      const candidate = new Client({
        host: "127.0.0.1",
        port: 55432,
        database: "postgres",
        user: "w1b_bootstrap",
        password: adminPassword,
        connectionTimeoutMillis: 1000,
      });
      try {
        await candidate.connect();
        admin = candidate;
        break;
      } catch {
        await candidate.end().catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
    if (!admin) throw Error("Real PostgreSQL 17 CI runtime did not start");
    try {
      const { rows } = await admin.query(
        "SELECT current_setting('server_version_num') version",
      );
      if (!/^17\d{4}$/.test(rows[0].version))
        throw Error("Wrong PostgreSQL major");
      await admin.query(
        `CREATE ROLE looper_w1b_test LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${password}'`,
      );
      await admin.query(
        "CREATE DATABASE looper_w1b OWNER looper_w1b_test ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'",
      );
      await admin.query("REVOKE CONNECT ON DATABASE looper_w1b FROM PUBLIC");
      await admin.query(
        "GRANT CONNECT ON DATABASE looper_w1b TO looper_w1b_test",
      );
    } finally {
      await admin.end();
    }
    writeFileSync(
      new URL("credentials.json", runtime),
      JSON.stringify({
        host: "127.0.0.1",
        port: 55432,
        database: "looper_w1b",
        user: "looper_w1b_test",
        password,
      }),
      { mode: 0o600 },
    );
    console.log(
      "Isolated real PostgreSQL 17 CI runtime ready; credentials remain local and ignored",
    );
  } catch (error) {
    stop();
    throw error;
  }
} else throw Error("Expected start or stop");
