/** Preserve Expo's original single-page bootstrap and correct only the
 * document viewport after export. No route, bundle or image is rewritten.
 *
 * Run with cwd=apps/mobile:
 *   node scripts/ensure-single-web-viewport.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const output = resolve("dist/index.html");
const source = readFileSync(output, "utf8");
if (!/<head(?:\s[^>]*)?>/i.test(source) || !/<\/head>/i.test(source)) {
  throw new Error("EXPO_WEB_HEAD_MISSING");
}
if (!/<script\b/i.test(source)) {
  throw new Error("EXPO_WEB_BOOTSTRAP_MISSING: refusing to publish blank single-page HTML");
}
if (!/\bid=["']root["']/i.test(source)) {
  throw new Error("EXPO_WEB_ROOT_MISSING");
}
const viewport = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />';
const cleaned = source.replace(/<meta\s+[^>]*\bname=["']viewport["'][^>]*>/gi, "");
const patched = cleaned.replace(/<\/head>/i, `  ${viewport}\n</head>`);
if (!patched.includes(viewport)) throw new Error("EXPO_WEB_VIEWPORT_INJECTION_FAILED");
writeFileSync(output, patched, "utf8");
console.log(JSON.stringify({
  status: "EXPO_SINGLE_WEB_BOOTSTRAP_PRESERVED",
  root: true,
  scriptCount: (patched.match(/<script\b/gi) || []).length,
  viewport,
}));
