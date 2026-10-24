import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {F1_SOURCE_CANVAS, F1_VISUAL_FRAMES, f1CoverTransform, f1Frame, f1ViewportFrame, f1MarmotTapRegion, f1BackpackTapRegion, f1RectsOverlap, f1HitboxIsUsable} from "../src/f1-scene-projection";

test("V-F1 art uses exactly the same cover projection as 941x1672 Forest",()=>{
  assert.deepEqual(F1_SOURCE_CANVAS,{width:941,height:1672});
  for(const [w,h] of [[360,640],[390,845],[353,768]]){
    const tr=f1CoverTransform(w,h);
    assert.ok(Math.abs(tr.backgroundWidth-w)<0.0001||Math.abs(tr.backgroundHeight-h)<0.0001);
    assert.ok(tr.backgroundWidth>=w&&tr.backgroundHeight>=h);
    assert.ok(tr.offsetX<=0.0001&&tr.offsetY<=0.0001);
    const sprout=f1Frame("sprout",w,h);
    assert.equal(sprout.width,F1_VISUAL_FRAMES.sprout.width*tr.scale);
    assert.ok(sprout.left+sprout.width/2>w*.35&&sprout.left+sprout.width/2<w*.7);
    for(const key of ["knowledge","mission","backpack","tools","sprout"] as const){
      assert.ok(f1HitboxIsUsable(F1_VISUAL_FRAMES[key],w,h), key+" not tappable on "+w+"x"+h);
      const f=f1ViewportFrame(key,w,h);
      assert.ok(f.left>=0 && f.left+f.width<=w+.0001,key+" clipped horizontally");
      assert.ok(f.top>=0 && f.top+f.height<=h+.0001,key+" clipped vertically");
    }
  }
});

test("Forest sprites, touch areas and background no longer use competing square-world coordinates",()=>{
  const forest=readFileSync(new URL("../app/forest.tsx",import.meta.url),"utf8");
  assert.match(forest,/style=\{frame\("knowledge"\)\}/);
  assert.match(forest,/style=\{frame\("mission"\)\}/);
  assert.match(forest,/frame\("backpack"\)/);
  assert.match(forest,/testID="open-backpack"/);
  assert.match(forest,/styles\.backpackQaTouch/);
  assert.match(forest,/style=\{frame\("tools"\)\}/);
  assert.match(forest,/style=\{frame\("sprout"\)\}/);
  assert.doesNotMatch(forest,/worldRect\(/);
  assert.doesNotMatch(forest,/style=\{entry\(/);
  assert.doesNotMatch(forest,/source=\{require\("\.\.\/assets\/stump\.png"\)\}/);
  assert.ok(forest.includes("APPROVED_F1_BACKGROUND ?? require") ||
            forest.includes("scene_forest_clearing_base.png"),
            "Keep the candidate fallback or the exact approved local Forest background");
});

test("HUD preview honors QA gate and hides Energy under Lv3",()=>{
  const forest=readFileSync(new URL("../app/forest.tsx",import.meta.url),"utf8");
  const hud=readFileSync(new URL("../src/f1-qa-hud-preview.tsx",import.meta.url),"utf8");
  assert.match(forest,/<F1QaHudPreview/);
  assert.match(forest,/energyVisible=\{state.level>=3\}/);
  assert.match(forest,/source=\{QA_F1_TWO_ROW_HUD_ART\}/);
  assert.match(hud,/if\(!qaAllowed \|\| !source\) return null/);
  assert.match(hud,/HUD ART CANDIDATE/);
});

test("surgical local integration tool has valid syntax and enforces protected assets",()=>{
  const scriptPath=new URL("../scripts/pr64-surgical-render.mjs",import.meta.url);
  execFileSync(process.execPath,["--check",fileURLToPath(scriptPath)]);
  const code=readFileSync(scriptPath,"utf8");
  assert.match(code,/LOCAL_CHANGE_CONFLICT/);
  assert.match(code,/PROTECTED_FILE_SHA_MISMATCH/);
  assert.match(code,/LOST_EXISTING_TEST_ID/);
  assert.match(code,/scene_forest_clearing_base\.png/);
  assert.match(code,/qa-hud-two-rows-candidate\.png/);
  assert.doesNotMatch(code,/execFileSync\("git",\["(?:reset|merge|rebase|clean|checkout|stash)/);
});

test("QA marmot and native sprout touch rectangles never overlap on supported iPhone ratios",()=>{
  const forest=readFileSync(new URL("../app/forest.tsx",import.meta.url),"utf8");
  for(const [w,h] of [[360,640],[390,845],[353,768],[706,1536]]) {
    const character=f1MarmotTapRegion(w,h);
    const sprout=f1ViewportFrame("sprout",w,h);
    assert.equal(f1RectsOverlap(character,sprout),false, "touch zones overlap on "+w+"x"+h);
    assert.ok(character.width>=44 && character.height>=44, "character touch target too small");
    assert.ok(character.left>=0&&character.left+character.width<=w,"character touch outside viewport");
    assert.ok(character.top>=0&&character.top+character.height<=h,"character touch outside viewport");
  }
  assert.match(forest,/testID="marmot-slot"/);
  assert.match(forest,/styles\.marmotQaTouch/);
  assert.match(forest,/testID="sprout-hotspot"/);
  assert.match(forest,/testID="sprout-info-panel"|SproutInfoContents/);
});

test("all Lv1 and Lv5 Native QA interactive targets have distinct visible touch bounds",()=>{
  for(const [w,h] of [[360,640],[390,845],[353,768],[1080,1920],[1080,2340]]) {
    const targets={
      knowledge:f1ViewportFrame("knowledge",w,h),
      marmot:f1MarmotTapRegion(w,h),
      sprout:f1ViewportFrame("sprout",w,h),
      mission:f1ViewportFrame("mission",w,h),
      backpack:f1BackpackTapRegion(w,h),
      tools:f1ViewportFrame("tools",w,h),
      treehouse:f1ViewportFrame("treehouse",w,h),
    };
    const keys=Object.keys(targets) as Array<keyof typeof targets>;
    for(const name of keys){
      const a=targets[name];
      assert.ok(a.width>=w/360*44 && a.height>=w/360*44,name+" too small at "+w+"x"+h);
      assert.ok(a.left>=0 && a.top>=0 && a.left+a.width<=w+1 && a.top+a.height<=h+1,name+" outside viewport");
      for(const other of keys){
        if(other<=name)continue;
        assert.equal(f1RectsOverlap(a,targets[other]),false,name+" overlaps "+other+" at "+w+"x"+h);
      }
    }
  }
});

test("Forest return-welcome replaces route instead of dismissing the Native activity",()=>{
  const forest=readFileSync(new URL("../app/forest.tsx",import.meta.url),"utf8");
  const begin=forest.indexOf('testID="return-welcome"');
  assert.ok(begin>=0,"Return to Welcome button not found");
  const code=forest.slice(begin,begin+340);
  assert.match(code,/setSheet\(null\)/);
  assert.match(code,/router\.replace\("\/"\)/);
  assert.doesNotMatch(code,/router\.dismissTo\("\/"\)/);
});
