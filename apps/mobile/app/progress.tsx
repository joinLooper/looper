import React from "react";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { useDemo } from "../src/state";
import { RESOURCES } from "../src/model";
import { Button, Page, s } from "../src/ui";
export default function Progress() {
  const { state, dispatch } = useDemo();
  return (
    <Page eyebrow="今天的一小步" title="任務與我的進度">
      <View style={s.card}>
        <Text style={[s.title, { fontSize: 24 }]}>
          Lv{state.level} · 森林居民
        </Text>
        <Text style={s.body}>
          EXP {RESOURCES.exp}　⭐ {RESOURCES.stars}　⚡ {RESOURCES.energy}
        </Text>
        <Text style={s.small}>固定測試數值，不對應正式帳號或經濟計算。</Text>
      </View>
      <View style={s.card}>
        <Text style={[s.title, { fontSize: 22 }]}>出門前，準備自己的杯子</Text>
        <Text style={s.body}>
          把可重複使用的杯子放進包包。{"\n"}讓今天的選擇，從一件小事開始。
        </Text>
        <Button
          title={state.missionComplete ? "示範任務已完成" : "標記示範完成"}
          testID="complete-mission"
          disabled={state.missionComplete}
          onPress={() => dispatch({ type: "mission" })}
        />
        <Text
          accessibilityLiveRegion="polite"
          testID="mission-feedback"
          style={s.small}
        >
          {state.missionComplete
            ? "已完成 · 僅更新本機畫面狀態，不發獎、不寫帳本。"
            : "按下後只更新本次測試狀態，不需要商家核銷。"}
        </Text>
      </View>
      <Button title="返回森林" secondary onPress={() => router.back()} />
    </Page>
  );
}
