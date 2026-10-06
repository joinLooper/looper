# W1B portable PostgreSQL 17 runtime

This Windows-only helper provisions the official EDB ZIP linked by PostgreSQL.org, inside this checkout. It does not run an installer, register a Windows service, change PATH, or connect to Supabase. Requires PowerShell, curl.exe, and the existing Windows runtime dependencies used by the official binaries.

From the repository root:

```powershell
./scripts/w1b-pg-bootstrap.ps1
./scripts/w1b-pg-start.ps1
./scripts/w1b-pg-status.ps1
./scripts/w1b-pg-stop.ps1
./scripts/w1b-pg-reset.ps1
```

Bootstrap pins PostgreSQL 17.11, EDB build 5, verifies both the pinned SHA-256 and supplier checksum, checks available disk space against ZIP entry sizes, and extracts the archive without executing its bundled GUI/installers. It fails on partial extraction rather than overwriting arbitrary files. All state lives under ignored `.runtime/postgres17/`:

- `binary/pgsql/`: official ZIP contents, including bin/lib/share.
- `data/`: new UTF8 / C locale cluster, UTC server and log timezone.
- `logs/`: PostgreSQL logs.
- `temp/`: ZIP, temporary SQL, and local password file.
- `credentials.json`: generated test-only bootstrap and application passwords; never print or commit this file.
- `cluster-owner.json`: fixed repository/data-path ownership guard.
- `download-evidence.json`: local source/version/checksum/disk metadata.

PostgreSQL 17 on this Windows host cannot initialize a UTF8 cluster under a non-ASCII binary/data path. The helper temporarily maps user-session DOS device `W:` to this exact project-local runtime using the Windows API. It is not a persistent drive, service, registry installation, PATH change, or environment-variable change. It refuses any existing `W:` mapping to another target, verifies the owned target before each use, and removes its exact mapping on stop. The data remains in this checkout; deletion checks always use its real absolute path. Reserve `W:` for this runtime while it is running.

The listener is fixed to `127.0.0.1:55432`. HBA allows only IPv4 loopback with SCRAM-SHA-256. The test database is `looper_w1b`; its owner/login is `looper_w1b_test`, with no superuser, createdb, createrole, or replication privileges. Cluster initialization uses a separate random-password bootstrap superuser. Connection credentials are only supplied to child psql processes using the ignored local password file; the script restores process environment values afterward.

Start checks the port before launching with `pg_ctl`, then verifies a real psql connection. Stop uses `pg_ctl stop -m fast -w` (normal transactional shutdown). Status returns process status and database identity. Reset stops this cluster, verifies the exact fixed absolute data path, ownership marker and major version, rejects linked runtime/data entries, deletes only `data/`, and creates a fresh empty test database. It deliberately preserves the official binaries, download evidence, logs and local test credentials. There is no arbitrary path argument. Do not use reset while W1B tests are running.

This runtime contains no Looper product schema or fixtures at R0. Start/stop/reset helpers never import product, school, Supabase, Birthday, or real-user data. The W1B implementation owns schema and explicit test fixtures after R0 validation passes.

Disk checks leave at least 768 MiB after extraction for cluster initialization and safety reserve. If a disk check fails, stop and supply space; do not remove other projects. Local files are Git-ignored, not a backup or secret vault.

Lifecycle and destructive-guard verification (resets only this W1B cluster): `./scripts/w1b-pg-verify.ps1`.
