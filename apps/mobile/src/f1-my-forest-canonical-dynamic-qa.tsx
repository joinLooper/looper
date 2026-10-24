/**
 * V-HUD-CARBONDETAIL: functional, READ-ONLY engineering QA of the approved
 * 941x1672 composition. This renderer retains the original scene pixels:
 * only the illustrated metric fields and the original green demo fill were
 * neutralized in a separately audited source crop. A full-screen redesign,
 * R6 alternate scene, new milestone art or mock player ledger are forbidden.
 *
 * The source screenshot STILL contains the five visual example milestones and
 * fixed bottom plank typography. Milestone appearance is not formal unlock QA;
 * actual Stage ledger flags are read separately and shown in QA audit metadata.
 */
import React, {useMemo} from "react";
import {Image, Pressable, StyleSheet, Text, View, useWindowDimensions} from "react-native";
import {myForestStageState,type MyForestLedgerSnapshot,
  type MyForestStage,type QaStageOverride} from "./f1-my-forest-info-contract";
import {CANONICAL_DYNAMIC_DEMO_ZONE,canonicalMetricLabels}
  from "./f1-my-forest-canonical-dynamic-model";
import {
  F1_MY_FOREST_CANONICAL_DYNAMIC_QA_IMAGE,
} from "./f1-my-forest-canonical-dynamic-qa-art.generated";

const W=941,H=1672;
const stages=[1,2,3,4,5] as const;
export function F1MyForestCanonicalDynamicQa({ledgerSnapshot=null,qaOverride={},
  selectedStage=1,onStageSelect,
}:{
  ledgerSnapshot?:MyForestLedgerSnapshot|null;
  qaOverride?:QaStageOverride;
  selectedStage?:MyForestStage;
  onStageSelect?:(stage:MyForestStage)=>void;
}){
  const {width,height}=useWindowDimensions();
  const scale=Math.min(width/W,height/H);
  const ox=(width-W*scale)/2,oy=(height-H*scale)/2;
  const values=canonicalMetricLabels(ledgerSnapshot);
  const stageStates=useMemo(()=>stages.map(s=>myForestStageState(s,ledgerSnapshot,
    qaOverride,true)),[ledgerSnapshot,qaOverride]);
  const frame=(x:number,y:number,w:number,h:number)=>({
    position:"absolute" as const,
    left:ox+x*scale,top:oy+y*scale,
    width:w*scale,height:h*scale,
  });
  const v=CANONICAL_DYNAMIC_DEMO_ZONE;
  // No sample values are inserted: missing real ledger stays dash/pending.
  if(!F1_MY_FOREST_CANONICAL_DYNAMIC_QA_IMAGE)return null;
  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}
    testID="my-forest-canonical-dynamic-qa">
    <Image source={F1_MY_FOREST_CANONICAL_DYNAMIC_QA_IMAGE}
      resizeMode="cover" accessible={false} style={styles.backgroundBleed}/>
    <Image source={F1_MY_FOREST_CANONICAL_DYNAMIC_QA_IMAGE}
      resizeMode="contain" accessible={false} style={StyleSheet.absoluteFill}
      testID="my-forest-canonical-dynamic-neutral-art"/>
    <Text pointerEvents="none" testID="my-forest-planted-count"
      numberOfLines={1} style={[styles.value,frame(v.planted.x,v.planted.y,v.planted.width,v.planted.height),
        {fontSize:Math.max(12,58*scale)}]}>{values.planted}</Text>
    <Text pointerEvents="none" testID="my-forest-total-carbon"
      numberOfLines={1} style={[styles.value,frame(v.carbon.x,v.carbon.y,v.carbon.width,v.carbon.height),
        {fontSize:Math.max(12,54*scale)}]}>{values.carbon}</Text>
    <Text pointerEvents="none" testID="my-forest-next-progress"
      numberOfLines={1} style={[styles.value,frame(v.next.x,v.next.y,v.next.width,v.next.height),
        {fontSize:Math.max(11,32*scale)}]}>{values.next}</Text>
    {/* Keep the original track, preserve left-to-right progress and disable
        filling entirely while the formal ledger remains unavailable. */}
    {values.fraction!==null&&values.fraction>0&&<View pointerEvents="none"
      testID="my-forest-ledger-progress-fill"
      style={[styles.progress,frame(v.progress.x,v.progress.y,
        v.progress.width*values.fraction,v.progress.height)]}/>}
    {stages.map((stage,i)=><Pressable key={stage}
      testID={"my-forest-stage-"+String(stage).padStart(2,"0")}
      accessibilityRole="button" onPress={()=>onStageSelect?.(stage)}
      accessibilityState={{selected:selectedStage===stage}}
      accessibilityLabel={"里程碑 Stage "+stage+"："+stageStates[i]+"（圖片僅為核准原圖示意）"}
      style={frame(v.milestones[i]-53,1250,106,137)} />)}
    <Text testID="my-forest-stage-list" pointerEvents="none"
      style={styles.visuallyHidden} accessibilityElementsHidden>五個里程碑</Text>
    <Text testID="my-forest-ledger-connection-state" pointerEvents="none"
      style={styles.notice}>{ledgerSnapshot?.source==="FORMAL_RESOURCE_LEDGER"
        ? "DEV QA：正式帳本只讀快照；里程碑圖仍為構圖參考"
        : "DEV QA：帳本未接線；原圖里程碑圖案僅供版位比對"}</Text>
  </View>;
}

export function f1CanonicalDynamicQaEligible(qaMode:boolean,dev:boolean){
  return qaMode && dev &&
    process.env.EXPO_PUBLIC_MY_FOREST_CANONICAL_DYNAMIC_QA==="1" &&
    F1_MY_FOREST_CANONICAL_DYNAMIC_QA_IMAGE!==null;
}
const styles=StyleSheet.create({
  backgroundBleed:{position:"absolute",left:0,right:0,top:0,bottom:0,opacity:0.6},
  value:{color:"#45270c",fontWeight:"800",textAlign:"center",
    textAlignVertical:"center"},
  progress:{backgroundColor:"#56c822",borderRadius:24,
    borderWidth:1,borderColor:"#428c18"},
  notice:{position:"absolute",bottom:7,left:7,right:7,padding:4,
    fontSize:9,color:"#fff5d8",textAlign:"center",borderRadius:6,
    backgroundColor:"#172718ec"},
  visuallyHidden:{position:"absolute",left:0,top:0,width:1,height:1,opacity:0},
});