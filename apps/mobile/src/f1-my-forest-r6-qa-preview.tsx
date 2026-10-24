/** R6 forest info visual composition for an EXPLICIT QA-only preview.
 * The R6 ZIP's placement.json is the source; this is its renderer projection.
 * QA art sources stay null unless a SHA-pinned local ingest fills them.
 * Stage 02–05 are visually DIM in this isolated QA preview, not ledger unlocks.
 */
import React from "react";
import {Image, Text, View, Pressable, StyleSheet, useWindowDimensions,
  type ImageSourcePropType} from "react-native";
import {F1_MY_FOREST_R6_QA_ART} from "./f1-my-forest-r6-qa-art.generated";
import {myForestValues, type MyForestLedgerSnapshot, type QaStageOverride} from "./f1-my-forest-info-contract";

const SOURCE={width:941,height:1672} as const;
const SOURCE_RECTS={
  fixed:{x:0,y:130,width:941,height:1412},
  planted:{x:199,y:1029,width:118,height:47},
  carbon:{x:455,y:1029,width:141,height:47},
  next:{x:641,y:990,width:205,height:43},
  progress:{x:638,y:1061,width:202,height:48},
  description:{x:76,y:1360,width:785,height:83},
} as const;
const positions=[94,250,406,562,718] as const;
const ICON_Y=1174, ICON_W=108, ICON_H=78;
const STAGE_Y=1257, VALUES_Y=1288;
const QA_OPT_IN=process.env.EXPO_PUBLIC_MY_FOREST_R6_QA_ART==="1";
export function f1R6QaEligible(qaMode:boolean,dev:boolean){
  return qaMode && dev && QA_OPT_IN &&
    !!F1_MY_FOREST_R6_QA_ART.background && !!F1_MY_FOREST_R6_QA_ART.fixedGroup;
}
const dashes=(v:number|null|undefined,suffix="")=>v==null?"—":String(v)+suffix;
export function F1MyForestR6QaPreview({ledgerSnapshot=null,selectedStage=1,
  stageOverrides={},onStageSelect,
}:{ledgerSnapshot?:MyForestLedgerSnapshot|null;
  selectedStage?:number;stageOverrides?:QaStageOverride;
  onStageSelect?:(stage:1|2|3|4|5)=>void;
}){
  const {width,height}=useWindowDimensions();
  const scale=Math.min(width/SOURCE.width,height/SOURCE.height);
  const originX=(width-SOURCE.width*scale)/2;
  const originY=(height-SOURCE.height*scale)/2;
  const frame=(r:{x:number,y:number,width:number,height:number})=>({
    position:"absolute" as const,left:originX+r.x*scale,top:originY+r.y*scale,
    width:r.width*scale,height:r.height*scale,
  });
  const f=F1_MY_FOREST_R6_QA_ART;
  const fields=myForestValues(ledgerSnapshot);
  const choices:ReadonlyArray<ImageSourcePropType|null>=[
    f.stages[0],
    f.stages[stageOverrides[2]==="bright"?1:2],
    f.stages[stageOverrides[3]==="bright"?3:4],
    f.stages[stageOverrides[4]==="bright"?5:6],
    f.stages[stageOverrides[5]==="bright"?7:8],
  ];
  const metric=(label:"planted"|"carbon"|"next",value:string)=>(
    <Text key={label} pointerEvents="none" testID={"r6-qa-metric-"+label}
      style={[styles.value,frame(SOURCE_RECTS[label]),{
        fontSize:Math.max(12,32*scale),lineHeight:Math.max(18,42*scale),
      }]} numberOfLines={1}>{value}</Text>
  );
  return <View testID="my-forest-r6-art-qa" pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    {f.background && <Image source={f.background} accessible={false}
      resizeMode="cover" style={StyleSheet.absoluteFill}/>}
    {f.fixedGroup && <Image source={f.fixedGroup} accessible={false}
      resizeMode="contain" style={frame(SOURCE_RECTS.fixed)}/>}
    {metric("planted",dashes(fields.plantedCount))}
    {metric("carbon",dashes(fields.accumulatedCarbonKg," kg"))}
    {metric("next",fields.nextPlantProgress?
      dashes(fields.nextPlantProgress.currentKg)+" / "+
      dashes(fields.nextPlantProgress.targetKg):"—")}
    {([1,2,3,4,5] as const).map((stage,i)=>{
      const x=positions[i];
      const img=choices[i];
      return <React.Fragment key={stage}>
        <Pressable onPress={()=>onStageSelect?.(stage)}
          testID={"r6-qa-stage-"+stage}
          accessibilityState={{selected:stage===selectedStage}}
          accessibilityRole="button" accessibilityLabel={"QA 預覽 Stage "+stage}
          style={frame({x:x-6,y:ICON_Y-12,width:ICON_W+12,height:ICON_H+42})}>
          {img && <Image source={img} accessible={false}
            resizeMode="contain" style={{width:"100%",height:"100%"}}/>}
        </Pressable>
        <Text pointerEvents="none" numberOfLines={1}
          style={[styles.caption,frame({x:x-8,y:STAGE_Y,width:124,height:28}),
            {fontSize:Math.max(10,27*scale)}]}>{"Stage "+String(stage).padStart(2,"0")}</Text>
        <Text pointerEvents="none" numberOfLines={1}
          style={[styles.caption,frame({x:x-8,y:VALUES_Y,width:124,height:27}),
            {fontSize:Math.max(10,27*scale)}]}>{fields.stageValues?.[stage]??"—"}</Text>
      </React.Fragment>;
    })}
    {fields.footerDescription!=null && <Text pointerEvents="none"
      style={[styles.description,frame(SOURCE_RECTS.description),
      {fontSize:Math.max(11,29*scale)}]}>{fields.footerDescription}</Text>}
    <Text testID="my-forest-ledger-connection-state" pointerEvents="none"
      style={styles.qaNotice}>R6 QA · 正式帳本尚未接線 · 里程碑僅供視覺預覽</Text>
    <Text testID="my-forest-stage-list" style={styles.stageSemantic} accessibilityElementsHidden>
      5 個里程碑 QA 插槽
    </Text>
  </View>;
}
const styles=StyleSheet.create({
 value:{color:"#503622",fontWeight:"700",textAlign:"center",textAlignVertical:"center"},
 caption:{color:"#fff0d2",fontWeight:"600",textAlign:"center",textAlignVertical:"center"},
 description:{color:"#fff0d2",textAlign:"center"},
 qaNotice:{position:"absolute",bottom:10,left:10,right:10,
   textAlign:"center",fontSize:10,color:"#ffedd2",backgroundColor:"#183023e0",padding:6},
 stageSemantic:{position:"absolute",left:0,top:0,width:1,height:1,opacity:0},
});