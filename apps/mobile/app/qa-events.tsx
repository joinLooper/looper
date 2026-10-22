import React, { useMemo, useState } from "react";
import { Text, TextInput, View, StyleSheet } from "react-native";
import { Redirect, router } from "expo-router";
import { Page, Button, colors, s } from "../src/ui";
import { useDemo } from "../src/state";
import { QA_LEVEL_GATE_ENABLED } from "../src/qa-levels";
import {
  QA_FLOW_COUNTS,
  FLOW_REGISTRY,
  pathById, childrenOf, eventsForPath, eventById,
  transitionsForEvent, startingVisualState, choicesFrom,
  qaAdvance, isWithinQaLevel, minimumQaLevel
} from "../src/qa/event-flow";

/** Auxiliary QA workbench, not a new game scene.
 * With QA disabled even direct deep links redirect away. */
const ENABLED = QA_LEVEL_GATE_ENABLED;
type Tab = "paths" | "events" | "detail";
export default function QaEvents() {
  const {state} = useDemo();
  const [tab,setTab] = useState<Tab>("paths");
  const [pathId,setPathId] = useState("ROOT");
  const [search,setSearch] = useState("");
  const [limit,setLimit] = useState(20);
  const [selectedId,setSelectedId] = useState<string | null>(null);
  const [visual,setVisual] = useState("");
  const [trail,setTrail] = useState<string[]>([]);
  const event = selectedId ? eventById(selectedId) : undefined;
  const path = pathById(pathId);
  const childPaths=childrenOf(pathId);
  const relatedEvents=eventsForPath(pathId);
  const reachable=event ? choicesFrom(event.id,visual) : [];
  const matching=useMemo(()=>{
    const q=search.trim().toLocaleLowerCase();
    return FLOW_REGISTRY.events.filter(e=>
      !q || [e.id,e.title,e.category,e.level,...e.paths].join(" ").toLocaleLowerCase().includes(q));
  },[search]);

  function openEvent(id:string) {
    const target=eventById(id);
    if(!target) return;
    setSelectedId(id);
    setVisual(startingVisualState(target));
    setTrail([]);
    setTab("detail");
  }
  function step(id:string) {
    if(!event) return;
    const next=qaAdvance(event.id,visual,id);
    if (!next) return;
    setTrail(previous=>[...previous,next.transitionId]);
    setVisual(next.nextVisualState);
  }

  if(!ENABLED) return <Redirect href="/" />;
  return <Page title="事件與畫面路徑" eyebrow="APP-EVENT-FLOW-01 / QA ONLY">
    <Text style={s.small} testID="qa-flow-counts">主表：{QA_FLOW_COUNTS.paths} 路徑列 · {QA_FLOW_COUNTS.events} 制度事件 · {QA_FLOW_COUNTS.transitions} 轉換</Text>
    <Text style={styles.warning}>此頁只模擬畫面流程，並非正式事件成功。沒有登入、網路送出、核銷、發獎、資源扣除或持久化紀錄。</Text>
    <Text style={s.body}>目前測試世界：Lv{state.level}。未達等級的事件只供閱讀，不允許模擬操作。</Text>
    <View style={s.row}>
      <Button secondary={tab !== "paths"} title="畫面路徑" testID="qa-flow-paths" onPress={()=>setTab("paths")}/>
      <Button secondary={tab === "paths"} title="制度事件" testID="qa-flow-events" onPress={()=>{setTab("events");setLimit(20);}}/>
      {tab==="detail" && <Button secondary title="返回事件" onPress={()=>setTab("events")}/>}
    </View>
    {tab==="paths" && <>
      <View style={s.card}>
        <Text accessibilityRole="header" style={styles.heading}>{path?.label || "畫面路徑"}</Text>
        <Text style={s.small}>路徑 ID：{pathId} · 等級／條件：{path?.level || "依上游"}</Text>
        {!!path?.trigger && <Text style={s.body}>操作入口：{path.trigger}</Text>}
        {!!path?.opens && <Text style={s.body}>點擊後顯示：{path.opens}</Text>}
        {!!path?.returns && <Text style={s.body}>退出／返回：{path.returns}</Text>}
        {!!path?.guard && <Text style={s.small}>規則：{path.guard}</Text>}
      </View>
      {pathId !== "ROOT" &&
        <Button secondary testID="qa-flow-parent" title="返回上一層" onPress={()=>setPathId(path?.parent || "ROOT")}/>}
      <Text style={styles.heading}>下一層可點路徑（{childPaths.length}）</Text>
      {childPaths.map(child=>
        <Button key={child.id} secondary testID={"qa-path-"+child.id}
          title={child.label+" · "+child.id} onPress={()=>setPathId(child.id)}/>)}
      {childPaths.length===0 && <Text style={s.small}>此路徑為末端節點；待正式介面／資產接線。不是自動判定功能完成。</Text>}
      <Text style={styles.heading}>關聯制度事件（{relatedEvents.length}）</Text>
      {relatedEvents.map(e=>
        <Button key={e.id} secondary testID={"qa-related-"+e.id}
          title={e.id+" · "+e.title} onPress={()=>openEvent(e.id)}/>)}
    </>}
    {tab==="events" && <>
      <TextInput
        testID="qa-flow-search"
        accessibilityLabel="搜尋事件 ID、名稱與類別"
        style={styles.search}
        value={search}
        onChangeText={v=>{setSearch(v);setLimit(20);}}
        placeholder="搜尋事件 ID／名稱／分類"
        placeholderTextColor={colors.muted}
      />
      <Text style={s.small}>共 {matching.length} 項；灰色標示的等級規則只供查看，不會略過真實解鎖。</Text>
      {matching.slice(0,limit).map(e=>
        <Button key={e.id} secondary testID={"qa-event-"+e.id}
          title={(isWithinQaLevel(e,state.level)?"":"🔒 ") + e.id+" · "+e.title+"（"+e.category+"）"}
          onPress={()=>openEvent(e.id)}/>)}
      {matching.length > limit && <Button title="顯示更多事件" testID="qa-flow-more" onPress={()=>setLimit(n=>n+20)}/>}
    </>}
    {tab==="detail" && event && <>
      <View style={s.card}>
        <Text accessibilityRole="header" style={styles.heading}>{event.id}｜{event.title}</Text>
        <Text style={s.body}>事件分類：{event.category}</Text>
        <Text style={s.body}>規則等級：{event.level || "依來源"}（初步起始級 Lv{minimumQaLevel(event.level)}）</Text>
        <Text style={s.small}>事件前狀態：{event.start} · 事件後狀態：{event.finish}</Text>
        <Text style={s.small}>路徑對照：{event.precision}</Text>
        <Text style={styles.warning}>本 QA 預覽不會觸發正式事件、發獎或核銷；任何「成功」都只是規格中的畫面狀態名稱。</Text>
      </View>
      <Text style={styles.heading}>畫面入口（{event.paths.length}）</Text>
      {event.paths.map(p=><Button key={p} secondary testID={"qa-event-path-"+p}
         title={p+" · "+(pathById(p)?.label||"回主表查核")}
         onPress={()=>{setPathId(p);setTab("paths");}}/>)}
      <Text style={styles.heading}>模擬畫面狀態：{visual}</Text>
      <Text style={s.small}>本事件共有 {transitionsForEvent(event.id).length} 筆轉換；已檢視 {trail.length} 步。</Text>
      {isWithinQaLevel(event,state.level) ? <>
        {reachable.map(t=><View key={t.id} style={s.card}>
          <Text style={s.small}>{t.id} · {t.branch}</Text>
          <Text style={s.body}>{t.from} → {t.to}</Text>
          <Text style={s.small}>觸發：{t.trigger || "詳正式事件規格"}</Text>
          {!!t.guard && <Text style={s.small}>必要條件（此頁不執行）：{t.guard}</Text>}
          {!!t.visible && <Text style={s.small}>規格要求的視覺變化：{t.visible}</Text>}
          <Button testID={"qa-transition-"+t.id} title="僅模擬這一步畫面" onPress={()=>step(t.id)}/>
        </View>)}
        {reachable.length===0 && <Text style={s.small}>此畫面沒有直接相接的下一步。請返回或使用下方檢視功能核對其他分支；不可當作成功完成。</Text>}
      </> : <Text style={styles.warning}>未達 Lv{minimumQaLevel(event.level)}，目前只開放閱讀，不能模擬轉換。</Text>}
      <Button secondary title="回到事件起點" testID="qa-flow-reset" onPress={()=>{setVisual(startingVisualState(event));setTrail([]);}}/>
      <Text style={styles.heading}>QA 規格檢視（不算有效玩家路徑）</Text>
      <Text style={s.small}>可切換至矩陣的其他起始狀態，檢查中斷、網路異常與待確認畫面。此動作不表示玩家真能抵達該狀態。</Text>
      {[...new Set(transitionsForEvent(event.id).map(t=>t.from))].map(from=>
        <Button key={from} secondary testID={"qa-inspect-"+from}
          title={"檢視 "+from} onPress={()=>{setVisual(from);setTrail([]);}}/>)}
    </>}
    <Button secondary title="返回森林" testID="qa-flow-return" onPress={()=>router.replace("/forest")}/>
    <Button secondary title="返回等級選單" testID="qa-flow-level-gate" onPress={()=>router.replace("/qa-levels")}/>
  </Page>;
}
const styles=StyleSheet.create({
  heading:{color:colors.ink,fontSize:17,lineHeight:26,fontWeight:"700"},
  search:{minHeight:52,borderWidth:1,borderColor:colors.line,backgroundColor:colors.paper,paddingHorizontal:15,borderRadius:12,color:colors.ink,fontSize:16},
  warning:{color:"#7C4A2B",backgroundColor:"#FFF4E8",padding:12,borderRadius:10,fontSize:13,lineHeight:21}
});
