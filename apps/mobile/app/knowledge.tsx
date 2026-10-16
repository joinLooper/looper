import React from "react";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { useDemo } from "../src/state";
import { Button, Page, s } from "../src/ui";
export default function Knowledge() {
  const { state, dispatch } = useDemo();
  const done = state.answer === "reuse";
  return (
    <Page eyebrow="樹樁旁的小發現 · 01" title="一個杯子的旅行">
      <Text style={s.body}>一個小習慣，也能讓日常更輕盈。</Text>
      <View style={s.card}>
        <Text style={[s.title, { fontSize: 23, lineHeight: 34 }]}>
          每天買飲料，怎麼做能減少一次性垃圾？
        </Text>
        <Text style={s.small}>本機示範知識卡 · 二選一</Text>
        <Button
          title="帶自己的杯子，清洗後重複使用"
          testID="answer-reuse"
          disabled={done}
          onPress={() => dispatch({ type: "answer", answer: "reuse" })}
        />
        <Button
          title="每天再拿一個一次性杯子"
          testID="answer-single"
          secondary
          disabled={done}
          onPress={() => dispatch({ type: "answer", answer: "single-use" })}
        />
        {state.answer && (
          <Text
            accessibilityLiveRegion="polite"
            testID="knowledge-feedback"
            style={s.feedback}
          >
            {done
              ? "答對了。讓杯子多陪你幾次，就能減少一次性垃圾。"
              : "再想一想：哪個選擇能讓同一個杯子使用更多次？"}
          </Text>
        )}
      </View>
      <Text style={s.small}>
        {done
          ? "已記錄示範作答；沒有發放 EXP、星星或其他資源。"
          : "這張卡只測試 Native 畫面與互動，不會連線正式服務。"}
      </Text>
      <Button title="返回森林" secondary onPress={() => router.back()} />
    </Page>
  );
}
