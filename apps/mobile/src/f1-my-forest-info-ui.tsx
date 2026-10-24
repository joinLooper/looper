import React, {useEffect, useState} from "react";
import {Image, Modal, Pressable, ScrollView, StyleSheet, Text, View,
  type ImageSourcePropType} from "react-native";
import {SafeAreaView} from "react-native-safe-area-context";
import {ForestAction} from "./forest-ui";
import {
  F1_MY_FOREST_HANDOFF, MY_FOREST_STAGE_NUMBERS,
  myForestStageState, myForestStageAsset, myForestValues,
  type MyForestStage, type UnlockableStage, type QaStageOverride,
  type MyForestLedgerSnapshot, type StageArtState,
} from "./f1-my-forest-info-contract";
import {
  F1_MY_FOREST_DIM_BACKGROUND, F1_MY_FOREST_STATIC_GROUP,
  F1_MY_FOREST_STAGE_ART,
} from "./f1-my-forest-info-art.generated";

/** The nine stage images are independent CANDIDATE slots; select exactly one
 * image (or one ART_PENDING placeholder) for each milestone.
 * Explicitly never import PR63 sprout-info-stage assets here.
 */
function stageSource(stage:MyForestStage,state:StageArtState):ImageSourcePropType|null {
  if(stage===1)return state==="default"?F1_MY_FOREST_STAGE_ART.stage01:null;
  if(stage===2)return state==="bright"?
    F1_MY_FOREST_STAGE_ART.stage02Bright:state==="dim"?F1_MY_FOREST_STAGE_ART.stage02Dim:null;
  if(stage===3)return state==="bright"?
    F1_MY_FOREST_STAGE_ART.stage03Bright:state==="dim"?F1_MY_FOREST_STAGE_ART.stage03Dim:null;
  if(stage===4)return state==="bright"?
    F1_MY_FOREST_STAGE_ART.stage04Bright:state==="dim"?F1_MY_FOREST_STAGE_ART.stage04Dim:null;
  return state==="bright"?
    F1_MY_FOREST_STAGE_ART.stage05Bright:state==="dim"?F1_MY_FOREST_STAGE_ART.stage05Dim:null;
}
function numberOrDash(value:number|null|undefined,suffix=""){
  return value===null || value===undefined?"—":String(value)+suffix;
}
function stageDescription(state:StageArtState){
  if(state==="bright")return "Bright";
  if(state==="dim")return "Dim";
  if(state==="default")return "Default";
  return "帳本待接";
}
const stageLabel=(stage:MyForestStage)=>String(stage).padStart(2,"0");

export function F1MyForestInfoOverlay({
  visible,onClose,qaMode,ledgerSnapshot=null,
}:{
  visible:boolean;
  onClose:()=>void;
  qaMode:boolean;
  /** Real backend adapter to be injected later; never derive from DemoState. */
  ledgerSnapshot?:MyForestLedgerSnapshot|null;
}) {
  const [selectedStage,setSelectedStage]=useState<MyForestStage>(1);
  const [qaStates,setQaStates]=useState<QaStageOverride>({});
  useEffect(()=>{
    if(visible){setSelectedStage(1);setQaStates({});}
  },[visible]);

  const fields=myForestValues(ledgerSnapshot);
  const stateFor=(stage:MyForestStage)=>myForestStageState(stage,ledgerSnapshot,qaStates,qaMode);
  const selectedState=stateFor(selectedStage);
  const selectedAsset=myForestStageAsset(selectedStage,selectedState);
  const selectStatus=(status:"bright"|"dim")=>{
    if(!qaMode || selectedStage===1)return;
    const key=selectedStage as UnlockableStage;
    setQaStates(old=>({...old,[key]:status}));
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View testID="my-forest-info-panel" style={styles.root}
        accessibilityViewIsModal accessibilityLabel="我的森林資訊欄">
        {F1_MY_FOREST_DIM_BACKGROUND ? (
          <View pointerEvents="none" testID="my-forest-dim-background"
            style={StyleSheet.absoluteFill}>
            <Image source={F1_MY_FOREST_DIM_BACKGROUND}
              style={StyleSheet.absoluteFill} resizeMode="cover" accessible={false}/>
          </View>
        ) : (
          <View pointerEvents="none" testID="my-forest-dim-background-pending"
            style={[StyleSheet.absoluteFill,styles.pendingBackground]}/>
        )}
        {/* This is exactly ONE indivisible scene-image slot.
            Never create separate movable marmot/stump/sign/decor sprites. */}
        {F1_MY_FOREST_STATIC_GROUP ? (
          <View pointerEvents="none" testID={F1_MY_FOREST_HANDOFF.fixedGroupId}
            style={StyleSheet.absoluteFill}>
            <Image source={F1_MY_FOREST_STATIC_GROUP}
              style={StyleSheet.absoluteFill} resizeMode="cover" accessible={false}/>
          </View>
        ) : null}
        <SafeAreaView style={styles.safe} edges={["top","bottom"]}>
          <View style={styles.header}>
            <Text style={styles.title}>我的森林</Text>
            <View testID="my-forest-close-container" style={styles.closeArea}>
              {/* Reuses the SAME shared control as the other Forest sheets. */}
              <ForestAction title="關閉 · 返回森林" testID="close-sheet" onPress={onClose}/>
            </View>
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.contents}
            showsVerticalScrollIndicator={false}>
            <View style={styles.status} testID="my-forest-candidate-status">
              <Text style={styles.warning}>VISUAL CANDIDATE · 尚未 ART_REVIEWED</Text>
              <Text style={styles.pendingSmall}>
                候選圖檔未接入；本畫面僅供路由、數值欄位與五階狀態 QA。
              </Text>
              <Text testID="my-forest-asset-content-qa-pending" style={styles.pendingSmall}>
                固定圖文殘留尚待人工檢查；正式美術導入 BLOCKED。
              </Text>
            </View>
            {!F1_MY_FOREST_STATIC_GROUP && (
              <View testID="my-forest-static-group-slot" pointerEvents="none"
                style={styles.staticGroupPlaceholder}>
                <Text style={styles.pendingTitle}>固定場景組｜ART_PENDING</Text>
                <Text style={styles.pendingSmall}>
                  {F1_MY_FOREST_HANDOFF.fixedGroupId}
                </Text>
              </View>
            )}
            <View testID="my-forest-data-fields" style={styles.dataArea}>
              <View style={styles.metrics}>
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>目前已種下</Text>
                  <Text testID="my-forest-planted-count" style={styles.metricValue}>
                    {numberOrDash(fields.plantedCount)}
                  </Text>
                </View>
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>累計減碳</Text>
                  <Text testID="my-forest-total-carbon" style={styles.metricValue}>
                    {numberOrDash(fields.accumulatedCarbonKg," kg CO₂e")}
                  </Text>
                </View>
              </View>
              <Text style={styles.metricLabel}>距離下一株</Text>
              <Text testID="my-forest-next-progress" style={styles.progress}>
                {fields.nextPlantProgress ?
                  numberOrDash(fields.nextPlantProgress.currentKg)+
                    " / "+numberOrDash(fields.nextPlantProgress.targetKg)+" kg CO₂e" : "—"}
              </Text>
            </View>
            <View testID="my-forest-stage-list" style={styles.stageSection}>
              <Text style={styles.sectionTitle}>森林成長里程碑</Text>
              <View style={styles.stageRow}>
                {MY_FOREST_STAGE_NUMBERS.map(stage=>{
                  const mode=stateFor(stage);
                  const img=stageSource(stage,mode);
                  const asset=myForestStageAsset(stage,mode);
                  // A stage has exactly one selected image source, no Bright+Dim pair.
                  return (
                    <Pressable key={stage} testID={"my-forest-stage-"+stageLabel(stage)}
                      accessibilityRole="button"
                      accessibilityLabel={"里程碑第"+stage+"階 "+stageDescription(mode)}
                      accessibilityState={{selected:qaMode&&stage===selectedStage}}
                      disabled={!qaMode}
                      onPress={()=>setSelectedStage(stage)}
                      style={[styles.stageCard,qaMode&&selectedStage===stage&&styles.selectedStage]}>
                      {img&&asset ? (
                        <Image source={img}
                          testID={"my-forest-stage-art-"+stageLabel(stage)+"-"+mode}
                          resizeMode="contain" style={styles.stageImage} accessible={false}/>
                      ) : (
                        <View style={styles.stagePlaceholder}
                          testID={"my-forest-stage-art-pending-"+stageLabel(stage)}>
                          <Text style={styles.pendingSmall}>美術待審</Text>
                        </View>
                      )}
                      <Text style={styles.stageName}>Stage {stageLabel(stage)}</Text>
                      <Text testID={"my-forest-stage-status-"+stageLabel(stage)}
                        style={styles.stageStatus}>{stageDescription(mode)}</Text>
                      <Text style={styles.stageValue}>
                        {fields.stageNames?.[stage]??"—"} · {fields.stageValues?.[stage]??"—"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            {qaMode && (
              <View testID="my-forest-qa-controls" style={styles.qa}>
                <Text style={styles.qaTitle}>QA 模式 · 不會改變正式資源或生長階段</Text>
                <Text testID="my-forest-qa-selected-stage" style={styles.stageStatus}>
                  預覽 Stage {stageLabel(selectedStage)}：{stageDescription(selectedState)}
                  {selectedAsset ? " · " +selectedAsset.filename : ""}
                </Text>
                {selectedStage!==1 &&
                  <View style={styles.qaButtons}>
                    <Pressable onPress={()=>selectStatus("bright")}
                      testID="qa-my-forest-bright" accessibilityRole="button"
                      style={styles.qaButton}><Text style={styles.qaText}>Bright 預覽</Text></Pressable>
                    <Pressable onPress={()=>selectStatus("dim")}
                      testID="qa-my-forest-dim" accessibilityRole="button"
                      style={styles.qaButton}><Text style={styles.qaText}>Dim 預覽</Text></Pressable>
                  </View>}
              </View>
            )}
            <Text testID="my-forest-description" style={styles.description}>
              {fields.footerDescription??"—"}
            </Text>
            <Text style={styles.pendingSmall} testID="my-forest-ledger-connection-state">
              {ledgerSnapshot?.source==="FORMAL_RESOURCE_LEDGER" ?
                "數值來源：正式資源帳本只讀快照" :
                "正式資源帳本尚未接線；未依 Lv／EXP／澆水推算數值或 Stage"}
            </Text>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:"#1f2c24"},
  pendingBackground:{backgroundColor:"#18271f"},
  staticGroupPlaceholder:{
    width:"100%",minHeight:140,
    borderWidth:1,borderStyle:"dashed",borderColor:"#7c917b",
    alignItems:"center",justifyContent:"center",padding:8,
  },
  safe:{flex:1},
  header:{paddingHorizontal:14,flexDirection:"row",justifyContent:"space-between",
    alignItems:"flex-start",gap:12},
  title:{fontSize:23,fontWeight:"700",color:"#fff1d4",paddingTop:9},
  closeArea:{backgroundColor:"#efe3c2",borderRadius:11,overflow:"hidden",minHeight:44,
    justifyContent:"center"},
  scroll:{flex:1},contents:{paddingHorizontal:14,paddingBottom:32,gap:15,paddingTop:8},
  status:{backgroundColor:"#1b2b23cc",padding:10,borderRadius:10,gap:4},
  warning:{color:"#f6dcb4",fontSize:12,fontWeight:"700"},
  pendingTitle:{color:"#faf0d8",fontSize:15,fontWeight:"600"},
  pendingSmall:{color:"#ddd8c6",fontSize:11,lineHeight:17},
  dataArea:{backgroundColor:"#202e27aa",padding:12,borderRadius:12,gap:8,marginTop:0},
  metrics:{flexDirection:"row",gap:8},
  metric:{flex:1,alignItems:"center",justifyContent:"center",minHeight:55},
  metricLabel:{color:"#e3decd",fontSize:12},
  metricValue:{fontSize:19,color:"#fff4db",fontWeight:"700"},
  progress:{color:"#fff4db",fontSize:18,fontWeight:"600"},
  stageSection:{gap:7,marginTop:24},
  sectionTitle:{fontSize:17,fontWeight:"700",color:"#e8e5d6"},
  stageRow:{flexDirection:"row",gap:4,justifyContent:"space-between"},
  stageCard:{flex:1,minWidth:0,alignItems:"center",paddingVertical:7,
    borderWidth:1,borderColor:"#526451",backgroundColor:"#17221b99",borderRadius:8},
  selectedStage:{borderColor:"#f1d19e"},
  stageImage:{width:"100%",height:46},
  stagePlaceholder:{width:"100%",height:46,justifyContent:"center",alignItems:"center"},
  stageName:{color:"#f4e6c9",fontSize:10,fontWeight:"600"},
  stageStatus:{color:"#ddd3b9",fontSize:10},
  stageValue:{color:"#cfcbbf",fontSize:9,textAlign:"center"},
  qa:{backgroundColor:"#233a32d9",padding:11,borderRadius:9,gap:8},
  qaTitle:{color:"#eedbad",fontSize:11},
  qaButtons:{flexDirection:"row",gap:10},
  qaButton:{paddingVertical:9,paddingHorizontal:14,borderWidth:1,
    borderColor:"#bdb197",borderRadius:8,minHeight:44,justifyContent:"center"},
  qaText:{color:"#fff1d4",fontSize:12},
  description:{fontSize:13,lineHeight:20,color:"#f0eadb",textAlign:"center"},
});
