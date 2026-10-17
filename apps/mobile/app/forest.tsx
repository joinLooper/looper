import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  ANCHORS,
  CHARACTER_SLOTS,
  demoJourney,
  fitScene,
  logicalRect,
  RESOURCES,
  sceneVisibility,
} from "../src/model";
import { useDemo } from "../src/state";
import { Badge, Button, colors, s } from "../src/ui";
type Sheet = "marmot" | "sprout" | "rabbit" | "treehouse" | "tools" | null;
export default function Forest() {
  const { state, dispatch, reduced } = useDemo();
  const [area, setArea] = useState({ width: 300, height: 300 });
  const [sheet, setSheet] = useState<Sheet>(null);
  const [imageReady, setImageReady] = useState(false);
  const [failure, setFailure] = useState(false);
  const [imageKey, setImageKey] = useState(0);
  const [previewState, setPreviewState] = useState<
    "ready" | "loading" | "error"
  >("ready");
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) {
      pulse.stopAnimation();
      pulse.setValue(1);
    }
    return () => {
      pulse.stopAnimation();
      pulse.setValue(1);
    };
  }, [pulse, reduced]);
  const journey = demoJourney(state);
  const { size, scale } = fitScene(area.width, area.height);
  const visible = sceneVisibility(state.level);
  function open(next: Sheet) {
    setSheet(next);
    if (!reduced)
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.96,
          duration: 90,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
  }
  const pending = !imageReady || previewState === "loading";
  const error = failure || previewState === "error";
  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <Badge />
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.eyebrow}>LOOPER · 晨光森林</Text>
            <Text accessibilityRole="header" style={styles.title}>
              森林空地 <Text style={styles.level}>Lv{state.level}</Text>
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="開啟測試工具"
            testID="open-tools"
            onPress={() => setSheet("tools")}
            style={styles.tool}
          >
            <Text style={styles.toolText}>測試工具</Text>
          </Pressable>
        </View>
        <Text style={styles.resources}>
          EXP {RESOURCES.exp}　 ⭐ {RESOURCES.stars}　 ⚡ {RESOURCES.energy}
          <Text style={styles.fixture}>　測試值</Text>
        </Text>
      </View>
      <View
        style={styles.sceneArea}
        onLayout={(e) => setArea(e.nativeEvent.layout)}
      >
        <Animated.View
          testID="forest-scene"
          accessibilityLabel="1000乘1000邏輯座標森林"
          style={[
            styles.stage,
            {
              width: size,
              height: size,
              transform: [{ scale: reduced ? 1 : pulse }],
            },
          ]}
        >
          <Image
            key={imageKey}
            source={require("../assets/forest-clearing.png")}
            style={[StyleSheet.absoluteFill, { width: size, height: size }]}
            resizeMode="contain"
            onLoad={() => setImageReady(true)}
            onError={() => setFailure(true)}
            accessible={false}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="左側樹樁：每日知識"
            testID="stump-hotspot"
            onPress={() => router.push("/knowledge")}
            style={[
              styles.anchor,
              logicalRect(ANCHORS.stump.x, ANCHORS.stump.y, 240, 240, scale),
              { minWidth: 48, minHeight: 48 },
            ]}
          >
            <Image
              source={require("../assets/stump.png")}
              style={{ width: 150 * scale, height: 150 * scale }}
              resizeMode="contain"
            />
            <Text style={styles.anchorLabel}>每日知識</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="土撥鼠位置，正式美術待提供"
            testID="marmot-slot"
            onPress={() => open("marmot")}
            style={[
              styles.character,
              logicalRect(
                CHARACTER_SLOTS.marmot.x,
                CHARACTER_SLOTS.marmot.y,
                220,
                290,
                scale,
              ),
            ]}
          >
            <Text style={styles.slotName}>土撥鼠</Text>
            <Text style={styles.pending}>ART_PENDING</Text>
            <Text style={styles.pose}>自然站姿</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="右側原生嫩芽：照顧"
            testID="sprout-hotspot"
            onPress={() => open("sprout")}
            style={[
              styles.anchor,
              logicalRect(ANCHORS.sprout.x, ANCHORS.sprout.y, 230, 240, scale),
              { minWidth: 48, minHeight: 48 },
            ]}
          >
            <Image
              source={require("../assets/sprout.png")}
              style={{ width: 130 * scale, height: 140 * scale }}
              resizeMode="contain"
            />
            <Text style={styles.anchorLabel}>
              {state.cared ? "已關心嫩芽" : "原生嫩芽"}
            </Text>
          </Pressable>
          {visible.rabbit && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Lv5 兔兔位置，正式美術待提供"
              testID="rabbit-slot"
              onPress={() => open("rabbit")}
              style={[
                styles.character,
                logicalRect(
                  CHARACTER_SLOTS.rabbit.x,
                  CHARACTER_SLOTS.rabbit.y,
                  210,
                  230,
                  scale,
                ),
              ]}
            >
              <Text style={styles.slotName}>兔兔</Text>
              <Text style={styles.pending}>ART_PENDING</Text>
            </Pressable>
          )}
          {visible.treehouseEntrance && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Lv5 樹屋入口位置測試"
              testID="treehouse-entry"
              onPress={() => open("treehouse")}
              style={[
                styles.treehouse,
                logicalRect(
                  ANCHORS.treehouse.x,
                  ANCHORS.treehouse.y,
                  300,
                  160,
                  scale,
                ),
                { minHeight: 48 },
              ]}
            >
              <Text style={styles.slotName}>樹屋入口</Text>
              <Text style={styles.pending}>Lv5 · 位置測試</Text>
            </Pressable>
          )}
          {(pending || error) && (
            <View
              testID={error ? "scene-error" : "scene-loading"}
              style={styles.load}
            >
              <Text style={s.feedback}>
                {error ? "森林暫時無法顯示" : "正在準備森林…"}
              </Text>
              {!error && <ActivityIndicator color={colors.green} />}
              <Button
                title={error ? "重新載入本機場景" : "返回測試場景"}
                onPress={() => {
                  setPreviewState("ready");
                  setFailure(false);
                  setImageReady(false);
                  setImageKey((k) => k + 1);
                }}
              />
            </View>
          )}
        </Animated.View>
      </View>
      <View style={styles.footer}>
        <Text style={styles.caption}>
          {state.level === 1
            ? "左樹樁 · 中央偏左土撥鼠 · 右嫩芽"
            : "Lv5 測試場景 · 兔兔與樹屋位置已顯示"}
        </Text>
        <View style={styles.journey}>
          <Text testID="journey-progress" style={styles.journeyHeading}>
            今日示範互動 {journey.completed}/{journey.total}
          </Text>
          <Text testID="journey-next" style={styles.journeyHint}>
            {journey.next ? `下一步：${journey.nextLabel}` : journey.nextLabel}
          </Text>
        </View>
        <Text testID="motion-status" style={s.small}>
          {reduced ? "減少動態：已啟用" : "動態：跟隨系統設定"} ·
          角色正式素材待提供
        </Text>
        <View style={styles.nav}>
          <Button
            title="每日知識"
            secondary
            onPress={() => router.push("/knowledge")}
            style={{ flex: 1 }}
          />
          <Button
            title="任務與進度"
            testID="open-progress"
            onPress={() => router.push("/progress")}
            style={{ flex: 1 }}
          />
        </View>
        <Pressable
          testID="return-welcome"
          accessibilityRole="button"
          accessibilityLabel="回到歡迎頁"
          onPress={() => router.replace("/")}
          style={styles.welcomeLink}
        >
          <Text style={styles.welcomeLinkText}>回到歡迎頁</Text>
        </Pressable>
      </View>
      <Modal
        visible={sheet !== null}
        transparent
        animationType={reduced ? "none" : "fade"}
        onRequestClose={() => setSheet(null)}
      >
        <View style={styles.scrim}>
          <SafeAreaView style={styles.sheet} edges={["bottom"]}>
            <ScrollView contentContainerStyle={styles.sheetContent}>
              {sheet === "tools" ? (
                <>
                  <Text accessibilityRole="header" style={styles.title}>
                    本機測試工具
                  </Text>
                  <Text style={s.small}>
                    只切換測試畫面，不會修改等級、經濟或正式帳號。
                  </Text>
                  <View style={s.row}>
                    <Button
                      title="切換 Lv1"
                      testID="fixture-lv1"
                      secondary
                      onPress={() => {
                        dispatch({ type: "level", level: 1 });
                        setSheet(null);
                      }}
                    />
                    <Button
                      title="切換 Lv5"
                      testID="fixture-lv5"
                      secondary
                      onPress={() => {
                        dispatch({ type: "level", level: 5 });
                        setSheet(null);
                      }}
                    />
                  </View>
                  <View style={styles.switchRow}>
                    <Text style={s.body}>強制減少動態</Text>
                    <Switch
                      testID="reduced-motion-toggle"
                      accessibilityLabel="強制減少動態"
                      value={state.reduceMotion}
                      onValueChange={(enabled) =>
                        dispatch({ type: "motion", enabled })
                      }
                    />
                  </View>
                  <Text style={s.small}>
                    系統已啟用時，App 不會覆蓋系統設定。
                  </Text>
                  <Button
                    title="模擬載入中"
                    secondary
                    onPress={() => {
                      setPreviewState("loading");
                      setSheet(null);
                    }}
                  />
                  <Button
                    title="模擬場景錯誤"
                    secondary
                    onPress={() => {
                      setPreviewState("error");
                      setSheet(null);
                    }}
                  />
                  <Button
                    title="重設所有本機測試狀態"
                    secondary
                    onPress={() => {
                      dispatch({ type: "reset" });
                      setPreviewState("ready");
                      setSheet(null);
                    }}
                  />
                </>
              ) : (
                <>
                  <Text accessibilityRole="header" style={styles.title}>
                    {sheet === "marmot"
                      ? "在這裡，慢慢來。"
                      : sheet === "sprout"
                        ? "給嫩芽一點關心"
                        : sheet === "rabbit"
                          ? "兔兔 · Lv5 角色插槽"
                          : "樹屋入口 · Lv5"}
                  </Text>
                  <Text style={s.body}>
                    {sheet === "marmot"
                      ? "土撥鼠正式圖像待美術線提供。姿勢預留：自然站立、雙手輕放身前。此處沒有替代角色或舊版角色。"
                      : sheet === "sprout"
                        ? "這株原生嫩芽有自己的小角落。今天也來看看它吧。"
                        : sheet === "rabbit"
                          ? "兔兔僅在 Lv5 測試資料中顯示。本輪只驗證位置及等級門檻，不代替正式角色美術驗收。"
                          : "入口門檻已開放供位置驗證。樹屋內部不在本批實作；沒有新增升級或家具玩法。"}
                  </Text>
                  {sheet === "sprout" && (
                    <Button
                      title={state.cared ? "已記錄本機關心" : "記錄本機關心"}
                      disabled={state.cared}
                      onPress={() => dispatch({ type: "care" })}
                    />
                  )}
                  <Text style={s.small}>
                    本機測試 · 不消耗能量、不增加資源、不連線 Backend。
                  </Text>
                </>
              )}
              <Button
                title="關閉"
                testID="close-sheet"
                secondary
                onPress={() => setSheet(null)}
              />
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 8, gap: 12 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: { fontSize: 10, letterSpacing: 2, color: colors.muted },
  title: { fontSize: 27, fontWeight: "700", color: colors.ink, lineHeight: 36 },
  level: { fontSize: 16, color: colors.muted },
  tool: {
    minWidth: 64,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  toolText: { color: colors.muted, fontSize: 12 },
  resources: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  fixture: { color: colors.muted, fontSize: 10 },
  sceneArea: {
    flex: 1,
    marginHorizontal: 12,
    marginVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 220,
  },
  stage: { borderRadius: 28, overflow: "hidden", backgroundColor: "#D5DEC0" },
  anchor: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  anchorLabel: {
    color: "#263A2D",
    fontSize: 11,
    fontWeight: "600",
    backgroundColor: "#FFFBEAE8",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 9,
    overflow: "hidden",
  },
  character: {
    position: "absolute",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#FFF8DC",
    backgroundColor: "#F8F5E3DA",
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    minWidth: 48,
    minHeight: 60,
  },
  slotName: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  pending: { color: "#4B6454", fontSize: 8, textAlign: "center" },
  pose: { color: colors.muted, fontSize: 9 },
  treehouse: {
    position: "absolute",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "#F9F6E5DD",
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#EEE4C9",
  },
  footer: { paddingHorizontal: 20, paddingBottom: 8, gap: 8 },
  caption: { fontSize: 11, color: colors.muted, textAlign: "center" },
  nav: { flexDirection: "row", gap: 10 },
  journey: {
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: colors.soft,
    gap: 3,
  },
  journeyHeading: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  journeyHint: { color: colors.muted, fontSize: 12 },
  welcomeLink: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  welcomeLinkText: { color: colors.muted, fontSize: 12 },
  load: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#F5F4EBF5",
    justifyContent: "center",
    padding: 24,
    gap: 16,
  },
  scrim: { flex: 1, justifyContent: "flex-end", backgroundColor: "#152C2580" },
  sheet: {
    maxHeight: "85%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.cream,
    overflow: "hidden",
  },
  sheetContent: { padding: 24, gap: 16 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
  },
});
