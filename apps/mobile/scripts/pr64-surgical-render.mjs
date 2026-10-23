/**
 * PR64 surgical integration for dirty Windows Looper worktrees.
 * It NEVER runs reset/checkout/stash/merge/rebase or writes production data.
 * Dry run: node apps/mobile/scripts/pr64-surgical-render.mjs
 * Apply:   node apps/mobile/scripts/pr64-surgical-render.mjs --apply
 * Source forest.tsx diff: fixed PR63 base versus fetched PR64 head.
 * Only three absent companion modules and the exact verified hunks are eligible.
 */
import {execFileSync,spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,renameSync,unlinkSync} from "node:fs";
import {join,resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";

const args=process.argv.slice(2);
const flag=(value)=>args.includes(value);
const arg=(name,fallback)=>{
  const i=args.indexOf(name);
  return i<0?fallback:args[i+1];
};
const apply=flag("--apply");
const base=arg("--base","2b219152f59a920a13271ca11bc3c6133fda830e");
const head=arg("--head","FETCH_HEAD");
const root=resolve(dirname(fileURLToPath(import.meta.url)),"../../..");
const rel="apps/mobile/app/forest.tsx";
const modules=[
  "apps/mobile/src/f1-scene-projection.ts",
  "apps/mobile/src/f1-qa-hud-preview.tsx",
  "apps/mobile/tests/f1-iphone-alignment.test.ts",
];
const background="apps/mobile/assets/scene_forest_clearing_base.png";
const hudPng="apps/mobile/assets/f1/qa-hud-two-rows-candidate.png";
const hudSource="apps/mobile/src/f1-qa-hud-art.generated.ts";
const EXPECTED={
  [background]:"32021bd41d33f1b54197c3c171648f2ff0de696eb79c5b38d5a0ba8a0072f2d5",
  [hudPng]:"1f7a554640cd6137fde7d45193f6960d41f3a931b6ce85684364bf7a403a5ea1",
};
const git=(...a)=>execFileSync("git",a,{cwd:root,encoding:"utf8",maxBuffer:15_000_000});
const read=p=>readFileSync(join(root,p),"utf8");
const fileSha=p=>createHash("sha256").update(readFileSync(join(root,p))).digest("hex");
const ensure=(cond,reason)=>{if(!cond)throw Error(reason);};
const report={batch:"PR64-VISUAL-RENDER-CONTINUE-03",mode:apply?"APPLY":"DRY_RUN",
  base,head,originalHead:git("rev-parse","HEAD").trim(),modules:[],hunks:[],
  sourceIntegrity:[],state:"PRECHECK"};
const norm=t=>t.replace(/\r\n/g,"\n");
try{
  ensure(git("rev-parse","--show-toplevel").trim().replaceAll("\\","/").toLowerCase()===
    root.replaceAll("\\","/").toLowerCase(),"NOT_GIT_ROOT");
  const src=read(rel),sourceBefore=norm(src);
  ensure(src.includes("scene_forest_clearing_base"),"LOCAL_FOREST_BACKGROUND_REFERENCE_MISSING");
  const generated=read(hudSource);
  ensure(generated.includes("qa-hud-two-rows-candidate.png") &&
     !generated.includes("= null"),"LOCAL_HUD_IMPORT_NOT_ACTIVE; never overwrite generated.ts with null");
  for(const [path,expected] of Object.entries(EXPECTED)){
    ensure(existsSync(join(root,path)),"REQUIRED_PROTECTED_FILE_MISSING: "+path);
    const actual=fileSha(path);
    ensure(actual===expected,"PROTECTED_FILE_SHA_MISMATCH: "+path+" actual="+actual);
    report.sourceIntegrity.push({path,sha256:actual});
  }
  const originalIds=[...sourceBefore.matchAll(/testID="([^"]+)"/g)].map(m=>m[1]);
  // The user has an unpushed local background and other modifications; never
  // replace the complete file with a remote file.
  const old=norm(git("show",base+":"+rel));
  const desired=norm(git("show",head+":"+rel));
  ensure(old!==desired,"REMOTE_FOREST_DIFF_EMPTY");
  // git diff --no-index cannot read two stdin streams. Build diff through
  // temporary external files; no tracked file or source tree is modified.
  const outRoot=resolve(root+".runtime");
  const safeStamp=new Date().toISOString().replace(/[:.]/g,"-");
  const scratch=join(outRoot,"pr64-surgical-"+safeStamp+"-"+process.pid);
  mkdirSync(scratch,{recursive:true});
  const oldFile=join(scratch,"PR63-forest.tsx"),newFile=join(scratch,"PR64-forest.tsx");
  writeFileSync(oldFile,old);writeFileSync(newFile,desired);
  const diff=spawnSync("git",["diff","--no-index","--unified=3","--",oldFile,newFile],
    {cwd:root,encoding:"utf8",maxBuffer:20_000_000});
  ensure(diff.status===1,"EXPECTED_FOREST_DIFF_NOT_FOUND: "+diff.stderr);
  const lines=norm(diff.stdout).split("\n");
  const hunks=[];let current=null;
  for(const line of lines){
    if(line.startsWith("@@ ")){
      if(current)hunks.push(current);
      current={heading:line,old:[],next:[]};
    }else if(current){
      if(line.startsWith(" ")) {current.old.push(line.slice(1));current.next.push(line.slice(1));}
      else if(line.startsWith("-"))current.old.push(line.slice(1));
      else if(line.startsWith("+"))current.next.push(line.slice(1));
      else if(line.startsWith("\\ No newline")){ /* nothing */ }
      else if(line===""){ /* trailing diff newline */ }
      else throw Error("UNEXPECTED_DIFF_LINE: "+line);
    }
  }
  if(current)hunks.push(current);
  ensure(hunks.length>0&&hunks.length<60,"UNEXPECTED_HUNK_COUNT="+hunks.length);
  const candidateModules=[];
  for(const path of modules){
    const remote=norm(git("show",head+":"+path)),target=join(root,path);
    if(existsSync(target)){
      const local=norm(read(path));
      ensure(local===remote,"MODULE_ALREADY_EXISTS_WITH_DIFFERENT_CONTENT: "+path+"; compare manually");
      report.modules.push({path,status:"EXISTS_IDENTICAL"});
    } else{
      candidateModules.push({path,content:remote});
      report.modules.push({path,status:"NEW_MODULE_STAGED"});
    }
  }
  // Apply only exactly matching, unambiguous diff hunks to the local forest.
  // Existing unrelated edits are intentionally left untouched. Any mismatch
  // aborts before writing a single repository file.
  let local=sourceBefore;
  function occurrences(hay,needle){
    const out=[];let from=0;
    while(true){const at=hay.indexOf(needle,from);if(at<0)break;out.push(at);from=at+1;}
    return out;
  }
  for(const h of hunks){
    const before=h.old.join("\n"),after=h.next.join("\n");
    ensure(before.length>0&&after.length>0,"UNSAFE_ZERO_CONTEXT_HUNK: "+h.heading);
    let chosen=null;
    // If local edits changed a nearby CONTEXT line (e.g. the already-approved
    // background import), progressively trim only identical context. Never
    // trim the actual removed/added lines of the PR64 hunk.
    let lead=0,tail=0;
    while(lead<h.old.length && lead<h.next.length && h.old[lead]===h.next[lead])lead++;
    while(tail<h.old.length-lead && tail<h.next.length-lead &&
      h.old[h.old.length-1-tail]===h.next[h.next.length-1-tail])tail++;
    for(let trimmed=0;trimmed<=lead+tail && !chosen;trimmed++){
      for(let a=0;a<=Math.min(lead,trimmed);a++){
        const b=trimmed-a;
        if(b>tail)continue;
        const from=h.old.slice(a,h.old.length-b).join("\n");
        const to=h.next.slice(a,h.next.length-b).join("\n");
        if(!from || !to)continue;
        const matches=occurrences(local,from);
        if(matches.length===1){chosen={at:matches[0],from,to,trimFront:a,trimBack:b};break;}
        if(matches.length===0 && occurrences(local,to).length===1){
          chosen={already:true,trimFront:a,trimBack:b};break;
        }
      }
    }
    if(chosen && !chosen.already){
      local=local.slice(0,chosen.at)+chosen.to+local.slice(chosen.at+chosen.from.length);
      report.hunks.push({heading:h.heading,status:"MERGED",at:chosen.at,
        trimmedContext:[chosen.trimFront,chosen.trimBack]});
    }else if(chosen?.already){
      report.hunks.push({heading:h.heading,status:"ALREADY_PRESENT"});
    }else{
      throw Error("LOCAL_CHANGE_CONFLICT: "+h.heading+
        " ; matching PR64 change was not unique in current local Forest. No files touched.");
    }
  }
  ensure(local.includes("scene_forest_clearing_base"),"PROTECTED_BACKGROUND_REFERENCE_WOULD_BE_REMOVED");
  ensure(local.includes("F1QaHudPreview"),"HUD_RENDER_NOT_WIRED");
  ensure(!local.includes("worldRect(")&&!local.includes("style={entry("),
    "OLD_SQUARE_WORLD_LAYOUT_REMAINS");
  ensure(local.includes("QA_F1_TWO_ROW_HUD_ART"),"HUD_NON_NULL_REFERENCE_LOST");
  const afterIds=new Set([...local.matchAll(/testID="([^"]+)"/g)].map(m=>m[1]));
  for(const id of originalIds)ensure(afterIds.has(id),"LOST_EXISTING_TEST_ID: "+id);
  const oldOnPress=(sourceBefore.match(/onPress=/g)||[]).length;
  const newOnPress=(local.match(/onPress=/g)||[]).length;
  ensure(newOnPress===oldOnPress,"EVENT_HANDLERS_CHANGED: before="+oldOnPress+" after="+newOnPress);
  ensure(!local.includes("require(\"../assets/stump.png\")"),"DUPLICATED_FOREST_STUMP_REMAINS");
  ensure((local.match(/<F1QaHudPreview/g)||[]).length===1,"HUD_RENDER_COUNT_NOT_ONE");
  const originalSha=createHash("sha256").update(Buffer.from(src)).digest("hex");
  report.hunkCount=hunks.length;report.originalForestSha256=originalSha;
  report.changedForest=local!==sourceBefore;
  report.moduleCount=candidateModules.length;
  const proposal=join(scratch,"forest.pr64-proposed.tsx");
  writeFileSync(proposal,local);
  report.proposal=proposal; report.outputRoot=scratch;
  if(apply){
    ensure(createHash("sha256").update(readFileSync(join(root,rel))).digest("hex")===originalSha,
      "FOREST_CHANGED_SINCE_PRECHECK");
    // Immutable backup stored OUTSIDE the working tree.
    copyFileSync(join(root,rel),join(scratch,"forest.before.tsx"));
    for(const item of candidateModules){
      const dest=join(root,item.path);
      ensure(!existsSync(dest),"MODULE_APPEARED_DURING_PRECHECK: "+item.path);
    }
    for(const item of candidateModules){
      const dest=join(root,item.path);mkdirSync(dirname(dest),{recursive:true});
      writeFileSync(dest,item.content,{flag:"wx"});
    }
    if(local!==sourceBefore){
      const target=join(root,rel),temporary=target+".pr64-temporary-"+process.pid;
      const eol=src.includes("\r\n")?"\r\n":"\n";
      writeFileSync(temporary,local.replace(/\n/g,eol),{flag:"wx"});
      try{renameSync(temporary,target);}finally{if(existsSync(temporary))unlinkSync(temporary);}
    }
    report.state="APPLIED_UNCOMMITTED_NEEDS_TYPECHECK_AND_DEVICE_QA";
  }else report.state="DRY_RUN_PROPOSAL_ONLY";
  writeFileSync(join(scratch,"merge-report.json"),JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report,null,2));
}catch(e){
  console.error("PR64_SAFE_MERGE_ABORTED: "+e.message);
  process.exitCode=2;
}
