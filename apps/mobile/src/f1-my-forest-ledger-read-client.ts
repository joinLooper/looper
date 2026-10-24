/**
 * Authenticated, strictly read-only consumer of /player/my-forest/ledger.
 * Never queries /player/state (that GET may trigger lazy Energy writes).
 * No demo-state fallback: a failed or unauthenticated request returns null.
 */
import type {MyForestLedgerSnapshot} from "./f1-my-forest-info-contract";

type Json = Record<string,unknown>;
function record(x:unknown):x is Json {
  return typeof x==="object" && x!==null && !Array.isArray(x);
}
function safeNumber(v:unknown){
  return typeof v==="number" && Number.isFinite(v) && v>=0;
}
function stageFields(input:unknown){
  if(!record(input))return false;
  return [2,3,4,5].every(i=>typeof input[i]==="boolean");
}
export function parseMyForestReadOnlySnapshot(input:unknown):MyForestLedgerSnapshot|null {
  if(!record(input) || input.source!=="FORMAL_RESOURCE_LEDGER")return null;
  if(!Number.isSafeInteger(input.plantedCount) || (input.plantedCount as number)<0 ||
     !safeNumber(input.accumulatedCarbonKg) || !stageFields(input.stageUnlocked))return null;
  const progress=input.nextPlantProgress;
  if(!record(progress) || !safeNumber(progress.currentKg) ||
     !safeNumber(progress.targetKg) || progress.targetKg===0 ||
     (progress.currentKg as number)>=(progress.targetKg as number))return null;
  const numericKeys=["growthVersion"];
  if(numericKeys.some(k=>input[k]!==undefined &&
      (!Number.isSafeInteger(input[k]) || (input[k] as number)<0)))return null;
  if(input.footerDescription!==null && input.footerDescription!==undefined &&
     typeof input.footerDescription!=="string")return null;
  if(input.stageNames!==undefined && !record(input.stageNames))return null;
  if(input.stageValues!==undefined && !record(input.stageValues))return null;
  // Do not materialize caller-owned mutable objects or infer missing stage art.
  const stages=input.stageUnlocked as Record<string,boolean>;
  return {
    source:"FORMAL_RESOURCE_LEDGER",
    plantedCount:input.plantedCount as number,
    accumulatedCarbonKg:input.accumulatedCarbonKg as number,
    nextPlantProgress:{
      currentKg:progress.currentKg as number,
      targetKg:progress.targetKg as number,
    },
    stageUnlocked:{2:stages["2"],3:stages["3"],4:stages["4"],5:stages["5"]},
    stageNames:{},stageValues:{},footerDescription:null,
  };
}

export async function fetchMyForestReadOnlySnapshot(
  apiOrigin:string,
  fetcher:typeof fetch=fetch,
  signal?:AbortSignal,
):Promise<MyForestLedgerSnapshot|null> {
  let origin:URL;
  try { origin=new URL(apiOrigin); } catch { return null; }
  // A third-party or cleartext endpoint may never receive a player cookie.
  if(origin.protocol!=="https:" || origin.username || origin.password ||
     origin.search || origin.hash || origin.pathname!=="/")return null;
  try {
    const response=await fetcher(new URL("/player/my-forest/ledger",origin).href,{
      method:"GET",credentials:"include",cache:"no-store",
      headers:{Accept:"application/json"},signal,
    });
    if(!response.ok)return null;
    return parseMyForestReadOnlySnapshot(await response.json());
  }catch{return null;}
}
