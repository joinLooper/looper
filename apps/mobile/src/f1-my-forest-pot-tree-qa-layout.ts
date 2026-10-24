/**
 * Pot/tree integration candidate inside the ORIGINAL 941x1672 My Forest panel.
 * Geometry is a machine-checkable placement proposal, NOT permission to change
 * the approved screen, its fixed artwork, or the official Asset Master.
 * Candidate from F1-MY-FOREST-POT-TREE-STANDARDIZE-01; source PNG bytes intact.
 */
import {F1_MY_FOREST_POT_TREE_SOURCE_AUTHORITY,
  type MyForestLedgerSnapshot} from "./f1-my-forest-info-contract";

type Rect=Readonly<{x:number;y:number;width:number;height:number}>;
type Slot=Readonly<{icon:Rect;count:Rect;unit:Rect;unitText:"盆"|"棵"}>;
const rect=(x:number,y:number,width:number,height:number):Rect=>
  Object.freeze({x,y,width,height});

export const F1_POT_TREE_QA_PLACEMENT=Object.freeze({
  sceneId:"forest_clearing",
  visualStateId:"V-HUD-CARBONDETAIL",
  canvas:Object.freeze({width:941,height:1672}),
  // Wood panel's first column; x>=344 belongs to carbon and MUST stay clear.
  firstColumn:rect(100,840,242,202),
  pot:Object.freeze({
    icon:rect(137,901,79,78),
    count:rect(132,985,53,39),
    unit:rect(190,985,27,39),
    unitText:"盆" as const,
  }),
  tree:Object.freeze({
    icon:rect(248,901,80,78),
    count:rect(243,985,53,39),
    unit:rect(301,985,29,39),
    unitText:"棵" as const,
  }),
  originalArtPixelReference:"b324e4cc37d52d04ecc730532f027fb990b8cc96e970e5f97916992f14652081",
  // User approved the new pot source, not the whole revised first-column art.
  potSourceSha256:F1_MY_FOREST_POT_TREE_SOURCE_AUTHORITY.pot.sha256,
  treeSourceSha256:F1_MY_FOREST_POT_TREE_SOURCE_AUTHORITY.tree.sha256,
  assetIdentityAuthority:"Visual Asset Register / Asset Master",
  treeVisualApproved:false,
  placementApproved:false,
  finalRuntimeEnabled:false,
} as const);

export function rectanglesOverlap(a:Rect,b:Rect){
  return a.x<b.x+b.width && b.x<a.x+a.width &&
    a.y<b.y+b.height && b.y<a.y+a.height;
}
export function withinRect(a:Rect,outer:Rect){
  return a.x>=outer.x && a.y>=outer.y &&
    a.x+a.width<=outer.x+outer.width &&
    a.y+a.height<=outer.y+outer.height;
}
/** Guard every proposed graphic, number and unit against the same source canvas. */
export function inspectPotTreeGeometry(){
  const p=F1_POT_TREE_QA_PLACEMENT;
  const all=[p.pot.icon,p.pot.count,p.pot.unit,p.tree.icon,p.tree.count,p.tree.unit];
  const invalid=all.map((r,i)=>({
    id:i,valid:withinRect(r,p.firstColumn)&&
      Number.isFinite(r.width)&&Number.isFinite(r.height)&&r.width>0&&r.height>0,
  })).filter(x=>!x.valid).map(x=>"OUTSIDE_FIRST_COLUMN_"+x.id);
  for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
    if(rectanglesOverlap(all[i],all[j]))invalid.push("OVERLAP_"+i+"_"+j);
  }
  if(p.pot.unitText!=="盆"||p.tree.unitText!=="棵")invalid.push("INVALID_UNITS");
  if(p.potSourceSha256!==F1_MY_FOREST_POT_TREE_SOURCE_AUTHORITY.pot.sha256)
    invalid.push("POT_SOURCE_CHANGED");
  return Object.freeze({valid:invalid.length===0,issues:invalid,
    potVisualApproved:F1_MY_FOREST_POT_TREE_SOURCE_AUTHORITY.pot.visualApproved,
    treeVisualApproved:F1_MY_FOREST_POT_TREE_SOURCE_AUTHORITY.tree.visualApproved,
    placementApproved:F1_MY_FOREST_POT_TREE_SOURCE_AUTHORITY.placementApproved});
}
function validCount(n:number|null|undefined){
  return n!==null&&n!==undefined&&Number.isSafeInteger(n)&&n>=0;
}
/** No demo values. Sprouts only belong in the five lamps BELOW the board. */
export function potTreeLabels(ledger:MyForestLedgerSnapshot|null){
  const authentic=ledger?.source==="FORMAL_RESOURCE_LEDGER";
  const pots=authentic&&validCount(ledger.potCount)?String(ledger.potCount):"—";
  const trees=authentic&&validCount(ledger.treeCount)?String(ledger.treeCount):"—";
  return Object.freeze({potCount:pots,treeCount:trees,potUnit:"盆",treeUnit:"棵"});
}
