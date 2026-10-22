import React from "react";
import { ImageBackground, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge, Button, colors, s } from "../src/ui";
import { QA_LEVEL_GATE_ENABLED } from "../src/qa-levels";
import { useDemo } from "../src/state";
export default function Welcome() {
  const { state, dispatch } = useDemo();
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={styles.page}>
        <Badge />
        <View style={styles.brand}>
          <Text style={styles.wordmark}>looper</Text>
          <Text style={styles.subtitle}>讓每一個小選擇，慢慢長成森林。</Text>
        </View>
        <ImageBackground
          source={require("../assets/forest-clearing.png")}
          style={styles.hero}
          imageStyle={{ borderRadius: 30, width: "100%", height: "100%" }}
          accessibilityLabel="晨光中的森林空地"
        >
          <View style={styles.note}>
            <Text style={styles.noteText}>從一片空地開始</Text>
          </View>
        </ImageBackground>
        <Text style={s.body}>
          今天，留一點時間給自己，{"\n"}也留一點溫柔給這片森林。
        </Text>
        <Button
          title="走進森林"
          testID="enter-forest"
          onPress={() => { if (state.qaPreview) dispatch({type: "qa-exit"}); router.push("/forest"); }}
        />
        {QA_LEVEL_GATE_ENABLED && <Button secondary title="QA 等級驗收：Lv1／3／5／10" testID="open-qa-levels" onPress={() => router.push("/qa-levels")} />}
        <Text style={[s.small, { textAlign: "center" }]}>
          Native 工程測試版 · 不需登入{"\n"}狀態僅留在本次執行，關閉 App
          後重設。
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    padding: 24,
    gap: 16,
    maxWidth: 620,
    width: "100%",
    alignSelf: "center",
  },
  brand: { paddingTop: 12, gap: 6 },
  wordmark: {
    fontSize: 48,
    fontWeight: "700",
    letterSpacing: -3,
    color: colors.ink,
  },
  subtitle: { color: colors.muted, fontSize: 14 },
  hero: {
    flex: 1,
    minHeight: 140,
    overflow: "hidden",
    borderRadius: 30,
    justifyContent: "flex-end",
  },
  note: {
    margin: 18,
    alignSelf: "flex-start",
    backgroundColor: "#FFFEF3E8",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
  },
  noteText: { color: colors.ink, fontSize: 13, fontWeight: "600" },
});
