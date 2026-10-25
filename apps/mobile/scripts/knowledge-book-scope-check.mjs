import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const git = args => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
const base = "623e17a74c96d527cab8539d0c98876e8895bd84";
const files = new Set([
  ...git(["diff", "--name-only", base]).split("\n"),
  ...git(["ls-files", "--others", "--exclude-standard"]).split("\n"),
].filter(Boolean));
const allowed = /^(apps\/mobile\/src\/knowledge-book\/(?!.*\.(?:png|zip|ora|psd|pyc)$).+|apps\/mobile\/tests\/knowledge-book-[^/]+\.test\.ts|apps\/mobile\/scripts\/knowledge-book-[^/]+\.(?:mjs|py)|apps\/mobile\/app\/knowledge-book-qa\.tsx|docs\/qa\/KNOWLEDGE_BOOK_R2_R3_(?:PARALLEL_CODEX_LANE|QA_EVIDENCE)\.md)$/;
const forbidden = [...files].filter(file => !allowed.test(file));
console.log(JSON.stringify({ base, checkedFiles: [...files], forbidden, status: forbidden.length ? "FAIL" : "PASS" }, null, 2));
if (forbidden.length) process.exitCode = 1;
