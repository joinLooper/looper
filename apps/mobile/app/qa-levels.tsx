import React, { useState } from "react";
import { Text, View, Pressable, StyleSheet } from "react-native";
import { Redirect, router } from "expo-router";
import { Page, Button, s, colors } from "../src/ui";
import { useDemo } from "../src/state";
import { QA_LEVELS, QA_LEVEL_GATE_ENABLED, qaWorld, type QaLevel } from "../src/qa-levels";
export default function QaLevelGate() {
  const { state, dispatch } = useDemo();
  const [selected, setSelected] = useState<QaLevel>(state.level);
  const fixture = qaWorld(selected);
  if (!QA_LEVEL_GATE_ENABLED) return <Redirect href="/" />;
  return <Page title="Forest 等級驗收" eyebrow="QA / DEBUG · 非正式玩家功能">
    <Text style={s.body}>先選等級，再進入森林。每次載入會清除本機答題、任務與照顧紀錄；不寫入玩家資料。</Text>
    <View style={styles.options}>
      {QA_LEVELS.map(level => <Pressable key={level} testID={"qa-select-" + level}
        accessibilityRole="radio" accessibilityLabel={"預覽 Lv" + level}
        accessibilityState={{ checked: selected === level }} onPress={() => setSelected(level)}
        style={({pressed}) => [styles.option, selected === level && styles.selected, pressed && {opacity: 0.7}]}>
        <Text style={[styles.label, selected === level && {color: "white"}]}>Lv{level}</Text>
      </Pressable>)}
    </View>
    <Text testID="qa-selected-summary" style={s.body}>Lv{selected} · {fixture.title}{"\n"}
      知識／活力：{fixture.knowledge ? "開啟" : "未解鎖"}{"\n"}
      第二居民／樹屋入口：{fixture.rabbit ? "開啟（內容待接入）" : "隱藏"}{"\n"}
      第一章完成標記：{fixture.chapterComplete ? "是（預置）" : "否"}</Text>
    <Button testID="qa-enter-forest" title={"以 Lv" + selected + " 進入 Forest"} onPress={() => {
      dispatch({type: "qa-level", level: selected}); router.replace("/forest");
    }} />
    <Button secondary testID="qa-levels-event-flows" title="查看本等級事件點擊路徑" onPress={() => {
      dispatch({type: "qa-level", level: selected}); router.push("/qa-events");
    }} />
    <Text style={s.small}>EXP 為既有等級累計門檻；活力預置為該級上限。星星 6、CO₂e 0 均為獨立測試值，沒有發獎或帳本交易。</Text>
    <Text style={s.body}>尚未完成的驗收內容</Text>
    {fixture.gaps.map(gap => <Text key={gap} style={s.small}>• {gap}</Text>)}
    <Button secondary title="離開 QA，返回歡迎頁" testID="qa-exit" onPress={() => {
      dispatch({type: "qa-exit"}); router.replace("/");
    }} />
  </Page>;
}
const styles=StyleSheet.create({
  options:{flexDirection:"row",flexWrap:"wrap",gap:10},
  option:{minHeight:56,minWidth:66,flexGrow:1,padding:14,borderRadius:12,borderWidth:1,borderColor:colors.green,alignItems:"center",justifyContent:"center"},
  selected:{backgroundColor:colors.green},label:{color:colors.ink,fontSize:18,fontWeight:"600"},
});
