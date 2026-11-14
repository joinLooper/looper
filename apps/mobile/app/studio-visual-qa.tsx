import React, { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type ImageSourcePropType } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { checklistSourcesByKey, FOREST_PROPS } from "../src/forest-art";
import type { ChecklistKey } from "../src/forest-art-state";

type Group = "scene" | "object" | "ui" | "character";
type Item = { id: string; title: string; group: Group; source?: ImageSourcePropType; status: string };
const BASE: Item[] = [
  { id: "forest", title: "森林｜既有工程場景底圖", group: "scene", source: require("../assets/forest-clearing.png"), status: "不是新宇宙正式分層母件" },
  { id: "stump", title: "樹樁｜既有工程道具", group: "object", source: require("../assets/stump.png"), status: "與 WSC03 新樹樁母件分開驗收" },
  { id: "sprout", title: "小樹苗｜既有工程道具", group: "object", source: require("../assets/sprout.png"), status: "仍需對照正式美術" },
  { id: "book", title: "知識小書｜閉合圖", group: "object", source: FOREST_PROPS.knowledge, status: "開書正式母件仍待驗收" },
  { id: "pouch", title: "背包｜布包", group: "object", source: FOREST_PROPS.backpack, status: "W2 已有 PNG／美術與功能驗收另計" },
  { id: "tools", title: "更多｜吊牌", group: "object", source: FOREST_PROPS.tools, status: "W2 已有 PNG／美術與功能驗收另計" },
  { id: "marmot", title: "土撥鼠｜可動畫原生母件", group: "character", status: "ART PENDING，禁止重新生成相似角色替代" },
  { id: "rabbit", title: "兔兔｜可動畫原生母件", group: "character", status: "ART PENDING，遵守 Canon V2 FINAL" },
];
const STATES: ChecklistKey[] = ["000", "001", "010", "011", "100", "101", "110", "111"];
const GROUPS: { label: string; value: Group | "all" }[] = [
  { label: "全部", value: "all" }, { label: "場景", value: "scene" },
  { label: "物件", value: "object" }, { label: "介面狀態", value: "ui" },
  { label: "人物", value: "character" },
];
export default function StudioVisualQa() {
  const [group, setGroup] = useState<Group | "all">("all");
  const [state, setState] = useState<ChecklistKey>("000");
  const [ratio, setRatio] = useState<"9:16" | "9:19.5">("9:16");
  const [focused, setFocused] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  if (!__DEV__) {
    return <SafeAreaView style={s.root}><Text>此驗收台只供 Looper 開發模式使用。</Text></SafeAreaView>;
  }
  const sign = checklistSourcesByKey(state);
  const dynamicItems: Item[] = [
    { id: "sign", title: "任務木牌｜狀態 " + state, group: "ui", source: sign.sign, status: "W2 既有狀態來源，非真實任務帳本" },
    { id: "journal", title: "任務手札｜狀態 " + state, group: "ui", source: sign.journal, status: "W2 既有狀態來源，正式母件另驗" },
  ];
  const items: Item[] = [...BASE, ...dynamicItems].filter(item => group === "all" || item.group === group);
  const phoneWidth = Math.min(340, Math.max(210, width - 54));
  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.content} testID="looper-studio-visual-qa">
        <Text style={s.kicker}>LOOPER STUDIO｜只供工程驗收</Text>
        <Text style={s.title}>看得見的製作成果</Text>
        <Text style={s.note}>這裡直接展示 App 已存在的原始圖檔。來源存在不等於新宇宙美術正式通過；尚缺角色母件時會明確顯示缺件。</Text>
        <View style={s.buttons}>
          <Pressable testID="review-open-real-forest" style={s.primary} onPress={() => router.push("/forest")}>
            <Text style={s.primaryText}>▶ 打開真正的 Forest 操作畫面</Text>
          </Pressable>
          <Pressable style={s.secondary} onPress={() => router.replace("/")}><Text style={s.secondaryText}>返回</Text></Pressable>
        </View>
        <Text style={s.section}>森林背景手機比例預覽</Text>
        <View style={s.buttons}>
          {(["9:16", "9:19.5"] as const).map(v => (
            <Pressable key={v} testID={"review-ratio-" + v} onPress={() => setRatio(v)} style={[s.chip, ratio === v && s.active]}>
              <Text style={ratio === v ? s.activeText : s.chipText}>{v}</Text>
            </Pressable>
          ))}
        </View>
        <View style={[s.phone, {width: phoneWidth, height: phoneWidth * (ratio === "9:16" ? 16 : 19.5) / 9 }]}>
          <Image source={require("../assets/forest-clearing.png")} style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }} resizeMode="cover" />
          <View style={s.phoneNote}><Text style={s.phoneNoteText}>僅背景比例預覽，正式 HUD 請開啟 Forest</Text></View>
        </View>
        <Text style={s.section}>已存在物件與各種畫面狀態</Text>
        <View style={s.buttons}>
          {GROUPS.map(x => (
            <Pressable key={x.value} testID={"review-filter-" + x.value} style={[s.chip, group === x.value && s.active]} onPress={() => {setGroup(x.value);setFocused(null);}}>
              <Text style={group === x.value ? s.activeText : s.chipText}>{x.label}</Text>
            </Pressable>
          ))}
        </View>
        {(group === "all" || group === "ui") && (
          <View style={s.stateBox}>
            <Text style={s.label}>切換任務木牌與手札 8 種真實圖像</Text>
            <View style={s.buttons}>
              {STATES.map(v => (
                <Pressable key={v} testID={"review-state-" + v} style={[s.chip, state === v && s.active]} onPress={() => setState(v)}>
                  <Text style={state === v ? s.activeText : s.chipText}>{v}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        {items.map(item => (
          <Pressable key={item.id} testID={"review-item-" + item.id} style={s.card} onPress={() => setFocused(focused === item.id ? null : item.id)}>
            {item.source
              ? <Image source={item.source} resizeMode="contain" style={[s.asset, focused === item.id && s.enlarged]} />
              : <View style={s.missing}><Text style={s.note}>正式可編輯母件尚缺</Text></View>}
            <Text style={s.label}>{item.title}</Text>
            <Text style={s.status}>{item.status}</Text>
            {item.source && <Text style={s.note}>點按此卡片可{focused === item.id ? "縮小" : "放大"}原始素材。</Text>}
          </Pressable>
        ))}
        <Text style={s.note}>這是內部視覺 QA，不是另一套普通介面版。所有素材仍以宇宙工程書、Canon 及唯一素材主表為準；App 實機 QA 另計。</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
const s=StyleSheet.create({
  root:{flex:1,backgroundColor:"#F1F5EC"},
  content:{padding:18,paddingBottom:50,gap:12},
  kicker:{fontSize:12,color:"#647D63",fontWeight:"700"},
  title:{fontSize:26,fontWeight:"800",color:"#2F573D"},
  note:{fontSize:13,lineHeight:21,color:"#657565"},
  label:{fontSize:15,fontWeight:"700",color:"#36583C"},
  section:{fontSize:18,fontWeight:"700",color:"#355B43",marginTop:8},
  buttons:{flexDirection:"row",flexWrap:"wrap",gap:8,alignItems:"center"},
  primary:{padding:13,backgroundColor:"#3E6A4A",borderRadius:14},
  primaryText:{color:"white",fontWeight:"700"},
  secondary:{padding:12,borderColor:"#B9C9B5",borderWidth:1,borderRadius:14},
  secondaryText:{color:"#416A4D"},
  chip:{paddingVertical:9,paddingHorizontal:13,backgroundColor:"white",borderWidth:1,borderColor:"#D1DECE",borderRadius:18},
  active:{backgroundColor:"#356247"},activeText:{color:"white"},chipText:{color:"#48624A"},
  phone:{backgroundColor:"#B1C0AA",borderWidth:8,borderColor:"#273A2D",borderRadius:28,overflow:"hidden",alignSelf:"center"},
  phoneNote:{position:"absolute",bottom:12,left:8,right:8,backgroundColor:"#18311DCC",padding:8,borderRadius:9},
  phoneNoteText:{textAlign:"center",color:"white",fontSize:11},
  stateBox:{padding:12,backgroundColor:"#E2EDDD",gap:9,borderRadius:12},
  card:{borderColor:"#D4DFD0",borderWidth:1,backgroundColor:"white",padding:12,borderRadius:16,gap:9},
  asset:{width:"100%",height:190,backgroundColor:"#EFF1E7",borderRadius:10},
  enlarged:{height:420},
  missing:{height:130,alignItems:"center",justifyContent:"center",backgroundColor:"#E7EAE1",borderRadius:10},
  status:{fontSize:12,color:"#91692C",fontWeight:"700"},
});
