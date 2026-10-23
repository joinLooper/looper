import React from "react";
import { Image, Pressable, StyleSheet, Text, View, } from "react-native";
import { F1_SPROUT_INFO_STAGES, qaSelectSproutStage, stageByIndex, type SproutStage } from "./f1-sprout-assets";

/** QA presentation only: static literal imports are required by Metro. Insert the
 * six verified ORIGINAL files before populating this map. Similar art is forbidden.
 * Empty map intentionally presents a prominent art-pending placeholder. */
import { APPROVED_F1_SPROUT_INFO_IMAGES } from "./f1-runtime-art.generated";

export function SproutInfoContents({
  qaMode,
  selectedStage,
  onSelectStage,
}: {
  qaMode: boolean;
  selectedStage: SproutStage;
  onSelectStage: (value: SproutStage) => void;
}) {
  const record=stageByIndex(selectedStage);
  const stageImage=APPROVED_F1_SPROUT_INFO_IMAGES[selectedStage];
  return (
    <View testID="sprout-info-panel" style={styles.group}>
      <Text accessibilityRole="header" style={styles.title}>我的森林 · 小樹苗成果</Text>
      <Text style={styles.body}>
        點擊的是森林中央原有小樹苗。下方五階圖只用於查看成長紀錄，
        不會替換主畫面植穴，也不會因觀看而增加 CO₂e。
      </Text>
      <View style={styles.assetContainer} testID="sprout-stage-art">
        {stageImage && record ? (
          <Image
            testID={"sprout-stage-art-"+selectedStage}
            source={stageImage}
            resizeMode="contain"
            style={styles.image}
            accessible
            accessibilityLabel={"小樹苗成果階段 "+selectedStage}
          />
        ) : (
          <View style={styles.placeholder} testID="sprout-stage-asset-pending">
            <Text style={styles.pendingTitle}>Stage {String(selectedStage).padStart(2,"0")}｜素材待接入</Text>
            <Text style={styles.pending}>此位置預留正式獨立圖檔，沒有使用相似插畫代替。</Text>
            <Text style={styles.pending}>{record?.assetId ?? "未設定階段"}</Text>
          </View>
        )}
      </View>
      {qaMode ? (
        <>
          <Text style={styles.qaLabel}>QA 模式｜只切換資訊頁素材，不修改減碳資料</Text>
          <View style={styles.buttons}>
            {F1_SPROUT_INFO_STAGES.map(stage=>{
              const selected=stage.stage===selectedStage;
              return (
                <Pressable
                  key={stage.assetId}
                  accessibilityRole="button"
                  accessibilityLabel={"查看階段 "+stage.stage}
                  accessibilityState={{selected}}
                  testID={"qa-sprout-stage-"+String(stage.stage).padStart(2,"0")}
                  onPress={()=>{
                    const valid=qaSelectSproutStage(stage.stage);
                    if(valid!==null) onSelectStage(valid);
                  }}
                  style={[styles.button, selected && styles.activeButton]}
                >
                  <Text style={[styles.buttonText, selected && styles.activeText]}>第 {stage.stage} 階</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : (
        <Text style={styles.pending}>正式階段須依已確認的 CO₂e 帳本與進度紀錄顯示，目前尚無正式資料接線。</Text>
      )}
      <Text style={styles.footer}>資訊素材群組：f1_sprout_info_states · 檢視不發獎、不扣資源</Text>
    </View>
  );
}
const styles=StyleSheet.create({
  group:{gap:12,paddingVertical:4},
  title:{fontSize:20,fontWeight:"700",color:"#344b39"},
  body:{fontSize:14,lineHeight:23,color:"#465a4a"},
  assetContainer:{alignItems:"center",justifyContent:"center",minHeight:160},
  image:{width:"100%",height:200},
  placeholder:{minHeight:160,width:"100%",borderWidth:1,borderStyle:"dashed",borderColor:"#9B9979",borderRadius:16,padding:18,justifyContent:"center",alignItems:"center",gap:8,backgroundColor:"#F3EFE0"},
  pendingTitle:{fontSize:17,fontWeight:"700",color:"#685B3D"},
  pending:{fontSize:12,lineHeight:20,color:"#776B55",textAlign:"center"},
  qaLabel:{fontSize:12,lineHeight:20,color:"#765D35"},
  buttons:{flexDirection:"row",flexWrap:"wrap",gap:6},
  button:{minWidth:55,minHeight:48,paddingHorizontal:10,paddingVertical:12,borderRadius:12,backgroundColor:"#E5E8D8",alignItems:"center",justifyContent:"center"},
  activeButton:{backgroundColor:"#3F6D4C"},
  buttonText:{fontSize:12,fontWeight:"600",color:"#3F6048"},
  activeText:{color:"#FFF"},
  footer:{fontSize:11,lineHeight:16,color:"#7B7B65"}
});
