/** QA-only HUD art activation. Requires original PNG; never redraws.
 * Usage: node apps/mobile/scripts/f1-enable-qa-hud.mjs --source <source-PNG>
 */
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync} from "node:fs";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
const app=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const i=process.argv.indexOf("--source"),input=i>=0?process.argv[i+1]:null;
if(!input||!existsSync(input))throw Error("Provide original F1_HUD_TWO_ROWS_CANDIDATE.png using --source");
const buf=readFileSync(input),sha=createHash("sha256").update(buf).digest("hex");
const expected="1f7a554640cd6137fde7d45193f6960d41f3a931b6ce85684364bf7a403a5ea1";
if(sha!==expected)throw Error("HUD_CANDIDATE_SHA_MISMATCH: "+sha);
if(buf.subarray(0,8).toString("hex")!=="89504e470d0a1a0a"||
   buf.readUInt32BE(16)!==1175||buf.readUInt32BE(20)!==457||buf[25]!==6)
 throw Error("HUD PNG must be 1175x457 RGBA");
const dest=join(app,"assets","f1","qa-hud-two-rows-candidate.png");
mkdirSync(dirname(dest),{recursive:true});
if(existsSync(dest)&&!readFileSync(dest).equals(buf))throw Error("Different file exists; manual resolution required");
if(!existsSync(dest))copyFileSync(input,dest);
const generated=[
  "/* Original candidate art, SHA verified. QA only. */",
  'import type {ImageSourcePropType} from "react-native";',
  "export const QA_F1_TWO_ROW_HUD_ART: ImageSourcePropType | null =",
  '  require("../assets/f1/qa-hud-two-rows-candidate.png");',
  ""
].join("\n");
writeFileSync(join(app,"src","f1-qa-hud-art.generated.ts"),generated);
console.log(JSON.stringify({status:"QA_HUD_CANDIDATE_READY_FOR_IPHONE_REVIEW",sha256:sha,productionFinal:false},null,2));
