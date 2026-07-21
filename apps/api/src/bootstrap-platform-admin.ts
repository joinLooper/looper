import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { InMemoryStore } from "./store.js";

export type PlatformAdminBootstrapArguments = {
  databasePath: string;
  displayName: string;
};

export function parsePlatformAdminBootstrapArguments(argv: string[]): PlatformAdminBootstrapArguments {
  let databasePath: string | undefined;
  let displayName: string | undefined;
  let confirmed = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--confirm-initial-super-admin") {
      if (confirmed) throw new Error("--confirm-initial-super-admin may only be provided once");
      confirmed = true;
      continue;
    }
    if (argument === "--database" || argument === "--display-name") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      if (argument === "--database") {
        if (databasePath !== undefined) throw new Error("--database may only be provided once");
        databasePath = value;
      } else {
        if (displayName !== undefined) throw new Error("--display-name may only be provided once");
        displayName = value;
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown bootstrap argument: ${argument}`);
  }

  if (!databasePath) throw new Error("--database is required");
  if (!displayName?.trim()) throw new Error("--display-name is required");
  if (!confirmed) throw new Error("--confirm-initial-super-admin is required");
  return { databasePath: resolve(databasePath), displayName: displayName.trim() };
}

export function runPlatformAdminBootstrapCommand(
  argv: string[],
  writeLine: (line: string) => void = (line) => console.log(line),
) {
  const input = parsePlatformAdminBootstrapArguments(argv);
  const store = new InMemoryStore(input.databasePath);
  try {
    const result = store.bootstrapInitialPlatformAdmin({ displayName: input.displayName });
    writeLine(JSON.stringify(result));
    return result;
  } finally {
    store.close();
  }
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (entryPath === import.meta.url) {
  try {
    runPlatformAdminBootstrapCommand(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "platform admin bootstrap failed");
    process.exitCode = 1;
  }
}
