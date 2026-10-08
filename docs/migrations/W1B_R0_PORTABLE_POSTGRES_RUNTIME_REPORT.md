# W1B-R0 Portable PostgreSQL Runtime Report

## A. Source

Branch: codex/app-w1b-postgres-parity. Source HEAD: 4a6c0955ef8d60c6c289f5d0832ee2fbeca286a2. W1A authority remains unchanged. This commit contains environment helpers/evidence only.

## B. PostgreSQL Version

postgres (PostgreSQL) 17.11. Server: PostgreSQL 17.11 on x86_64-windows, compiled by msvc-19.44.35229, 64-bit. Real postgres/initdb/pg_ctl/psql executed successfully.

## C. Download / SHA-256

- Official entry: https://www.postgresql.org/download/windows/
- Official linked archive page: https://www.enterprisedb.com/download-postgresql-binaries
- Official download link: https://sbp.enterprisedb.com/getfile.jsp?fileid=1260616
- Resolved source: https://get.enterprisedb.com/postgresql/postgresql-17.11-5-windows-x64-binaries.zip
- Filename: postgresql-17.11-5-windows-x64-binaries.zip
- SHA-256: 80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f
- Supplier checksum: https://get.enterprisedb.com/postgresql/postgresql-17.11-5-windows-x64-binaries.zip.sha256
- Official checksum comparison: PASS. No repack/mirror/installer/emulator used.

## D. Runtime Location

Project-local ignored .runtime/postgres17/{binary,data,logs,temp}. Official archive lives under binary/pgsql. Credentials and metadata remain under the same ignored runtime directory.

The first UTF8 initdb attempt failed because this Windows build passes the Chinese filesystem path in its ANSI codepage. Relative paths and native short-path lookup could not avoid non-ASCII names. The helper uses a nonpersistent user-session W: DOS-device alias to the exact same runtime directory. No files move outside the project. It verifies ownership before use, rejects a foreign W: assignment and removes its exact alias on stop. Reset uses the real absolute project path for deletion checks. This does not change PATH, system/user environment variables or Registry installation settings.

## E. Cluster Initialization

Fresh initdb; UTF8 encoding; C locale/collation; UTC server and log timezone. Database looper_w1b. New cluster only, no import. User tables at R0 completion: 0.

## F. Network Isolation

Actual OS listener: 127.0.0.1:55432 only. pg_hba.conf permits IPv4 loopback SCRAM-SHA-256 only. SELECT inet_server_addr() = 127.0.0.1. No LAN/public listener or Unix socket.

## G. Credentials

Generated test-only role looper_w1b_test, database owner, NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOREPLICATION. Separate local bootstrap role. Random passwords exist only in ignored credentials.json / password file; temporary SQL and initdb password file are removed after use. No passwords in this evidence or source-controlled files. No production, Supabase or school credentials used.

## H. Start / Stop / Reset

PASS: start, psql identity query, status, normal fast stop, released port, restart, reset/reinitialize, final status. The reset sentinel disappeared and the new test database was created. Invalid ownership pointing at C:\Program Files\PostgreSQL was rejected before stopping the active server. Arbitrary DataPath parameter was rejected by binding. Reparse points and unexpected major/path/owner fail closed.

Commands: scripts/w1b-pg-{bootstrap,start,stop,status,reset,verify}.ps1. verify intentionally resets this local test cluster. See scripts/W1B_POSTGRES_RUNTIME_README.md.

2026-10-08 revalidation: the complete lifecycle and ownership guard also PASS with output redirected to a log. Startup now uses a hidden pg_ctl launcher (waits only for pg_ctl), explicit UTF8 pipes for other CLI commands, and fail-closed PowerShell 7 wrappers. Unknown path arguments are rejected before stopping the server. No execution policy or global shell setting was changed. See the revalidation object in machine evidence.

## I. Disk Usage

| Measurement | Bytes |
| --- | ---: |
| Available before download | 3980365824 |
| ZIP | 381531864 |
| Extracted archive | 1002085601 |
| Fresh initialized cluster | 49231164 |
| Available after lifecycle verification | 2112487424 |

All figures are point-in-time measurements. Extraction checked required bytes plus 768 MiB reserve; no other project files were removed.

## J. Files Changed

.gitignore; scripts/w1b-pg-bootstrap.ps1; scripts/w1b-pg-runtime.ps1; four lifecycle wrappers; scripts/w1b-pg-verify.ps1; scripts/W1B_POSTGRES_RUNTIME_README.md; this report; W1B_R0_RUNTIME_RESULTS.json. Only source scripts/docs/ignore rules are committed. No binaries, data, logs, passwords, dependencies or product code.

## K. Safety Checks

Official checksum PASS; real PG17 PASS; loopback PASS; fresh isolated DB PASS; test role limits PASS; ignored credentials/binary/data PASS; start/stop/reset/guard PASS. No installer, Windows service, administrator-required installation, global PATH/environment change, Docker/Podman/WSL installation or Registry installation. Supabase and school databases untouched. Native/W1C not started.

## L. Final Status

**W1B-R0 PASS — RESUMING W1B**

Runtime gate is now unblocked. Resume the already-authorized original W1B implementation and full parity/regression gates; R0 PASS is not W1B PASS. The earlier W1B blocked report remains historical evidence and is superseded for runtime availability by this report.

Machine evidence: [W1B_R0_RUNTIME_RESULTS.json](W1B_R0_RUNTIME_RESULTS.json).
