/**
 * Import the ORIGINAL Main Forest pack, never info-page assets.
 * Run from any directory: node apps/mobile/scripts/f1-ingest-main-forest.mjs --source <unzipped-root>
 * Stage 01..05 are MAIN_SCENE candidates, not f1_sprout_info_stage_*.
 * Does not change world central sprout or automatic CO2e logic.
 */
import {createHash} from "node:crypto";
import {readFileSync, existsSync, mkdirSync, copyFileSync, writeFileSync} from "node:fs";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
const app=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const srcIndex=process.argv.indexOf("--source");
const root=srcIndex<0?null:resolve(process.argv[srcIndex+1]||"");
if(!root||!existsSync(root))throw Error("Extract supplied ZIP first; use --source <folder>");
const read=(name)=>readFileSync(join(root,name));
const text=read("README_交付說明.txt").toString("utf8");
if(!text.includes("05_MAIN_SCENE_SPROUT_STATES")||!text.includes("不是 CO₂e 成果資訊頁"))
  throw Error("WRONG_PACK_ROLE: this script requires MAIN_SCENE state originals, not info-page art");
const sumLines=read("SHA256SUMS.txt").toString("utf8").trim().split(/\r?\n/);
const expected=new Map(sumLines.map(l=>{const i=l.indexOf("  ");if(i<0)throw Error("Invalid SHA256SUMS");return [l.slice(i+2),l.slice(0,i)];}));
const manifest=read("manifest.csv").toString("utf8");
const specs=[
  ["01_FOREST_BACKGROUND_PASS/陽光瀑布森林秘境.png","scene_forest_clearing_base","PASS_BACKGROUND",941,1672,2,"assets/f1/forest-clearing-base.png"],
  ...[
    "可愛種子萌芽土丘圖示.png","透明背景的雙葉幼苗土丘圖示.png",
    "卡通風格三葉幼苗土堆.png","透明背景上的立體嫩芽土丘.png","陽光下的四葉幼苗土丘.png"
  ].map((name,i)=>["05_MAIN_SCENE_SPROUT_STATES/"+String(i+1).padStart(2,"0")+"_"+name,
    "REVIEW_MAIN_SPROUT_0"+(i+1),"CANDIDATE_NOT_FINAL",1254,1254,6,
    "art-review/f1-main-sprout/stage-"+String(i+1).padStart(2,"0")+".png"])
];
let audit=[];
for(const [path,id,status,w,h,type,dest] of specs){
  const src=join(root,path);
  if(!existsSync(src)||!expected.has(path))throw Error("MISSING_OR_UNLISTED_SOURCE: "+path);
  const bytes=readFileSync(src);
  if(bytes.subarray(0,8).toString("hex")!=="89504e470d0a1a0a"||
     bytes.toString("ascii",12,16)!=="IHDR")throw Error("NOT_PNG: "+path);
  if(bytes.readUInt32BE(16)!==w||bytes.readUInt32BE(20)!==h||bytes[25]!==type)
     throw Error("PNG_METADATA_MISMATCH: "+path);
  const sha=createHash("sha256").update(bytes).digest("hex");
  if(expected.get(path)!==sha||!manifest.includes(path+","+ "PNG,"+status))
    throw Error("MANIFEST_OR_SHA_MISMATCH: "+path);
  audit.push({path,assetId:status==="PASS_BACKGROUND"?id:null,candidateReviewKey:status==="CANDIDATE_NOT_FINAL"?id:null,role:status,sha256:sha,bytes:bytes.length,
    width:w,height:h,output:dest});
}
for(const a of audit){
  const dest=join(app,a.output);mkdirSync(dirname(dest),{recursive:true});
  if(existsSync(dest)){
    const digest=createHash("sha256").update(readFileSync(dest)).digest("hex");
    if(digest!==a.sha256)throw Error("DESTINATION_EXISTS_DIFFERENT: "+dest);
  }else copyFileSync(join(root,a.path),dest);
}
const code=[
  '/* Generated from PASS background SHA 32021bd4...; five main-scene candidates are NOT info assets. */',
  'import type {ImageSourcePropType} from "react-native";',
  'import type {SproutStage} from "./f1-sprout-assets";',
  'export const APPROVED_F1_BACKGROUND: ImageSourcePropType | null = require("../assets/f1/forest-clearing-base.png");',
  'export const APPROVED_F1_SPROUT_INFO_IMAGES: Readonly<Partial<Record<SproutStage,ImageSourcePropType>>> = Object.freeze({});',
  ''
].join("\n");
const destCode=join(app,"src/f1-runtime-art.generated.ts");
const current=readFileSync(destCode,"utf8");
if(current!==code && current.includes('require("../assets/f1/') && current.includes("sprout-info-stage-"))
  throw Error("INFO_ASSETS_ALREADY_INSTALLED: inspect before replacing mapping");
writeFileSync(destCode,code);
const info={batchId:"APP-MERGE-F1-SPROUT-INFO-01",sourceRole:"FOREST_MAIN_SCENE",scene:"V-F1",
  backgroundStatus:"ORIGINAL_IMPORTED_PENDING_BROWSER_NATIVE_IPHONE_QA",
  sproutCandidatesStatus:"ART_REVIEW_ONLY_NOT_LIVE",
  infoPanelStageSprites:"NOT_IN_THIS_PACK",
  ledgerWrites:false,items:audit};
const report=join(app,"art-review/f1-main-sprout/source-audit.json");
writeFileSync(report,JSON.stringify(info,null,2)+"\n");
console.log(JSON.stringify({status:"BACKGROUND_IMPORTED_MAIN_SCENE_CANDIDATES_QUARANTINED",report,items:audit.length},null,2));
