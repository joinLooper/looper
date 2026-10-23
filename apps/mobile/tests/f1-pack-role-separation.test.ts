import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src=(relative: string)=>readFileSync(new URL(relative,import.meta.url),"utf8");

test("Main Forest asset pack is NEVER mistaken for info-page sprites",()=>{
 const main=src("../scripts/f1-ingest-main-forest.mjs");
 const info=src("../scripts/f1-ingest-assets.mjs");
 assert.match(main,/05_MAIN_SCENE_SPROUT_STATES/);
 assert.match(main,/WRONG_PACK_ROLE/);
 assert.match(main,/sproutCandidatesStatus:"ART_REVIEW_ONLY_NOT_LIVE"/);
 assert.match(main,/INFO_ASSETS_ALREADY_INSTALLED/);
 assert.match(info,/MISSING_INFO_ONLY_ROLE_MANIFEST/);
 assert.match(info,/INFO_PAGE_ONLY/);
});
test("Main Forest background has a single import target; stage sprites stay out of world root",()=>{
 const main=src("../scripts/f1-ingest-main-forest.mjs");
 const forest=src("../app/forest.tsx");
 assert.match(main,/forest-clearing-base\.png/);
 assert.match(main,/APPROVED_F1_SPROUT_INFO_IMAGES[^\\n]+Object\.freeze\(\{\}\)/);
 assert.match(forest,/APPROVED_F1_BACKGROUND \\?\\? require/);
 assert.doesNotMatch(forest,/art-review\/f1-main-sprout/);
 assert.doesNotMatch(forest,/main-stage-[1-5]\.png/);
});
