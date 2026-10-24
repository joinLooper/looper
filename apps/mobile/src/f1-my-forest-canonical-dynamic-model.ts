/** Pure, platform-independent My Forest dynamic read-only contract.
 * Values only come from FORMAL_RESOURCE_LEDGER. Example screenshot numbers never
 * leak into the QA renderer when the real ledger is absent.
 */
import {myForestValues,type MyForestLedgerSnapshot} from "./f1-my-forest-info-contract";

export const CANONICAL_DYNAMIC_VIEW_STATE="DERIVED_SCREEN_CANDIDATE_QA_ONLY" as const;
export const CANONICAL_DYNAMIC_DEMO_ZONE={
  planted:{x:211,y:922,width:123,height:103},
  carbon:{x:449,y:922,width:139,height:103},
  next:{x:616,y:923,width:190,height:49},
  progress:{x:622,y:981,width:176,height:37},
  milestones:[155,309,463,618,772],
} as const;

export function canonicalProgressFraction(snapshot:MyForestLedgerSnapshot|null){
  if(snapshot?.source!=="FORMAL_RESOURCE_LEDGER")return null;
  const prog=snapshot.nextPlantProgress;
  if(!prog || !Number.isFinite(prog.currentKg) ||
      !Number.isFinite(prog.targetKg) || (prog.targetKg??0)<=0 ||
      (prog.currentKg??0)<0)return null;
  return Math.max(0,Math.min(1,(prog.currentKg as number)/(prog.targetKg as number)));
}
function shortNumber(n:number|null|undefined){
  if(n==null || !Number.isFinite(n))return "—";
  return String(Math.round(n*100)/100);
}
export function canonicalMetricLabels(ledger:MyForestLedgerSnapshot|null){
  const v=myForestValues(ledger);
  const next=v.nextPlantProgress;
  return {
    planted:shortNumber(v.plantedCount),
    carbon:shortNumber(v.accumulatedCarbonKg),
    next:next ? shortNumber(next.currentKg)+" / "+shortNumber(next.targetKg)+" kg" : "—",
    fraction:canonicalProgressFraction(ledger),
  };
}
