import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import {
  ANCHORS,
  CHARACTER_SLOTS,
  demoJourney,
  RESOURCES,
  sceneVisibility,
} from "../src/model";
import { useDemo } from "../src/state";
import { FOREST_ENTRIES, worldRect } from "../src/forest-layout";
import {
  DiegeticSheet,
  ForestAction,
  ForestPropButton,
  forestText as t,
} from "../src/forest-ui";
type Sheet =
  | "mission"
  | "backpack"
  | "marmot"
  | "sprout"
  | "rabbit"
  | "treehouse"
  | "tools"
  | null;
export default function Forest() {
  const { state, dispatch, reduced } = useDemo();
  const insets = useSafeAreaInsets();
  const [area, setArea] = useState({ width: 360, height: 640 });
  const [sheet, setSheet] = useState<Sheet>(null);
  const [imageReady, setImageReady] = useState(false);
  const [failure, setFailure] = useState(false);
  const [imageKey, setImageKey] = useState(0);
  const [previewState, setPreviewState] = useState<
    "ready" | "loading" | "error"
  >("ready");
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    // Cancel feedback immediately if the system changes its motion preference.
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
  const visible = sceneVisibility(state.level);
  const rect = (x: number, y: number, w: number, h: number) =>
    worldRect(x, y, w, h, area.width, area.height);
  const entry = (key: keyof typeof FOREST_ENTRIES) => {
    const a = FOREST_ENTRIES[key];
    return rect(a.x, a.y, a.width, a.height);
  };
  function open(next: Sheet) {
    setSheet(next);
    if (!reduced)
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.97,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
  }
  const pending = !imageReady || previewState === "loading";
  const error = failure || previewState === "error";
  const resetImage = () => {
    setPreviewState("ready");
    setFailure(false);
    setImageReady(false);
    setImageKey((k) => k + 1);
  };
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Image
        key={imageKey}
        source={require("../assets/forest-clearing.png")}
        style={styles.background}
        resizeMode="cover"
        onLoad={() => setImageReady(true)}
        onError={() => setFailure(true)}
        accessible={false}
      />

      <View
        style={[
          styles.world,
          {
            top: insets.top,
            bottom: Math.max(insets.bottom, 12),
            left: insets.left + 12,
            right: insets.right + 12,
          },
        ]}
        onLayout={(e) => setArea(e.nativeEvent.layout)}
        accessibilityElementsHidden={sheet !== null}
        importantForAccessibility={sheet ? "no-hide-descendants" : "auto"}
      >
        <View pointerEvents="none" style={styles.hud}>
          <Text style={styles.forestName}>晨 光 森 林</Text>
          <Text style={styles.hudValues}>
            Lv{state.level} · ✧ {RESOURCES.stars} · EXP {RESOURCES.exp} · ⚡{" "}
            {RESOURCES.energy}
          </Text>
          <Text style={styles.testNote}>本機測試 · 固定資源 · 美術占位</Text>
        </View>
        <View
          testID="forest-scene"
          pointerEvents="box-none"
          style={StyleSheet.absoluteFill}
          accessibilityLabel="1000乘1000邏輯座標森林"
        >
          <ForestPropButton
            kind="book"
            label="左側樹樁：每日知識"
            testID="stump-hotspot"
            reduced={reduced}
            onPress={() => router.push("/knowledge")}
            style={entry("knowledge")}
          >
            <Image
              source={require("../assets/stump.png")}
              style={styles.stump}
              resizeMode="contain"
            />
          </ForestPropButton>
          <Animated.View
            style={[
              styles.slot,
              rect(CHARACTER_SLOTS.marmot.x, CHARACTER_SLOTS.marmot.y, 64, 112),
              { transform: [{ scale: pulse }] },
            ]}
          >
            <Pressable
              testID="marmot-slot"
              accessibilityRole="button"
              accessibilityLabel="土撥鼠位置，正式美術待提供"
              onPress={() => open("marmot")}
              style={({ pressed }) => [
                styles.slotTouch,
                { opacity: pressed ? 0.65 : 1 },
              ]}
            >
              <View style={styles.groundShadow} />
              <View style={styles.slotMarker} />
              <Text style={styles.slotTitle}>土撥鼠</Text>
              <Text style={styles.pending}>ART_PENDING</Text>
            </Pressable>
          </Animated.View>
          <ForestPropButton
            kind="plant"
            label={state.cared ? "已關心嫩芽" : "原生嫩芽"}
            testID="sprout-hotspot"
            reduced={reduced}
            onPress={() => open("sprout")}
            style={rect(ANCHORS.sprout.x, ANCHORS.sprout.y, 64, 78)}
          >
            <Image
              source={require("../assets/sprout.png")}
              style={styles.sprout}
              resizeMode="contain"
            />
          </ForestPropButton>
          <ForestPropButton
            kind="wood"
            label="任務"
            testID="open-progress"
            reduced={reduced}
            onPress={() => open("mission")}
            style={entry("mission")}
          />
          <ForestPropButton
            kind="bag"
            label="背包與收藏"
            testID="open-backpack"
            reduced={reduced}
            onPress={() => open("backpack")}
            style={entry("backpack")}
          />
          <ForestPropButton
            kind="stone"
            label="更多與設定"
            testID="open-tools"
            reduced={reduced}
            onPress={() => open("tools")}
            style={entry("tools")}
          />
          {visible.rabbit && (
            <Pressable
              testID="rabbit-slot"
              accessibilityRole="button"
              accessibilityLabel="Lv5 兔兔位置，正式美術待提供"
              onPress={() => open("rabbit")}
              style={[
                styles.slotTouch,
                styles.slot,
                rect(
                  CHARACTER_SLOTS.rabbit.x,
                  CHARACTER_SLOTS.rabbit.y,
                  68,
                  88,
                ),
              ]}
            >
              <View style={styles.groundShadow} />
              <Text style={styles.slotTitle}>兔兔</Text>
              <Text style={styles.pending}>ART_PENDING</Text>
            </Pressable>
          )}
          {visible.treehouseEntrance && (
            <ForestPropButton
              kind="wood"
              label="樹屋入口"
              testID="treehouse-entry"
              reduced={reduced}
              onPress={() => open("treehouse")}
              style={rect(ANCHORS.treehouse.x, ANCHORS.treehouse.y, 112, 68)}
            />
          )}
        </View>
        <Text testID="motion-status" pointerEvents="none" style={styles.motion}>
          {reduced ? "減少動態：已啟用" : "動態：跟隨系統"}
        </Text>
        {(pending || error) && (
          <View
            testID={error ? "scene-error" : "scene-loading"}
            style={styles.load}
          >
            <Text style={t.title}>
              {error ? "森林暫時無法顯示" : "正在準備森林…"}
            </Text>
            {!error && <ActivityIndicator color="#55704b" />}
            <ForestAction
              title={error ? "重新載入本機場景" : "返回測試場景"}
              onPress={resetImage}
            />
            <ForestAction
              title="回到歡迎頁"
              onPress={() => router.replace("/")}
            />
          </View>
        )}
      </View>
      <DiegeticSheet
        visible={sheet !== null}
        reduced={reduced}
        onClose={() => setSheet(null)}
      >
        {sheet === "mission" ? (
          <>
            <Text accessibilityRole="header" style={t.title}>
              今天，帶著杯子出發
            </Text>
            <Text style={t.body}>
              把可重複使用的杯子放進包包。{"\n"}從一件小事，開始今天的森林日常。
            </Text>
            <Text testID="journey-progress" style={t.note}>
              今日示範互動 {journey.completed}/{journey.total}
            </Text>
            <Text testID="journey-next" style={t.note}>
              {journey.nextLabel}
            </Text>
            <ForestAction
              title={state.missionComplete ? "示範任務已完成" : "標記示範完成"}
              testID="complete-mission"
              disabled={state.missionComplete}
              onPress={() => dispatch({ type: "mission" })}
            />
            <Text
              testID="mission-feedback"
              accessibilityLiveRegion="polite"
              style={t.feedback}
            >
              {state.missionComplete
                ? "已完成 · 這一小步已記在手札裡。"
                : "準備好時，替今天留下一個記號。"}
            </Text>
            <Text style={t.note}>
              僅更新本機測試狀態，不發獎、不消耗資源、不寫帳本。
            </Text>
            <ForestAction
              title="查看任務與玩家進度"
              onPress={() => {
                setSheet(null);
                router.push("/progress");
              }}
            />
          </>
        ) : sheet === "backpack" ? (
          <>
            <Text accessibilityRole="header" style={t.title}>
              樹下的小布包
            </Text>
            <Text style={t.body}>袋口暫時空著，留給未來收藏的森林小物。</Text>
            <Text style={t.note}>
              背包入口與容器示意。尚未提供收藏、物品、容量或使用功能，也不會新增道具。
            </Text>
          </>
        ) : sheet === "tools" ? (
          <>
            <Text accessibilityRole="header" style={t.title}>
              森林小記
            </Text>
            <Text style={t.note}>本機測試工具 · 不連線正式服務</Text>
            <ForestAction
              title="查看玩家進度"
              onPress={() => {
                setSheet(null);
                router.push("/progress");
              }}
            />
            <ForestAction
              title="切換 Lv1"
              testID="fixture-lv1"
              onPress={() => {
                dispatch({ type: "level", level: 1 });
                setSheet(null);
              }}
            />
            <ForestAction
              title="切換 Lv5"
              testID="fixture-lv5"
              onPress={() => {
                dispatch({ type: "level", level: 5 });
                setSheet(null);
              }}
            />
            <View style={styles.switchRow}>
              <Text style={t.body}>強制減少動態</Text>
              <Switch
                testID="reduced-motion-toggle"
                accessibilityLabel="強制減少動態"
                value={state.reduceMotion}
                onValueChange={(enabled) =>
                  dispatch({ type: "motion", enabled })
                }
              />
            </View>
            <Text style={t.note}>系統已啟用時，App 不會覆蓋系統設定。</Text>
            <ForestAction
              title="模擬載入中"
              testID="simulate-scene-loading"
              onPress={() => {
                setPreviewState("loading");
                setSheet(null);
              }}
            />
            <ForestAction
              title="模擬場景錯誤"
              testID="simulate-scene-error"
              onPress={() => {
                setPreviewState("error");
                setSheet(null);
              }}
            />
            <ForestAction
              title="重設所有本機測試狀態"
              onPress={() => {
                dispatch({ type: "reset" });
                setPreviewState("ready");
                setSheet(null);
              }}
            />
            <ForestAction
              title="回到歡迎頁"
              testID="return-welcome"
              onPress={() => {
                setSheet(null);
                router.replace("/");
              }}
            />
          </>
        ) : (
          <>
            <Text accessibilityRole="header" style={t.title}>
              {sheet === "marmot"
                ? "在這裡，慢慢來。"
                : sheet === "sprout"
                  ? "給嫩芽一點關心"
                  : sheet === "rabbit"
                    ? "兔兔 · Lv5 角色插槽"
                    : "樹屋入口 · Lv5"}
            </Text>
            <Text style={t.body}>
              {sheet === "marmot"
                ? "土撥鼠正式圖像待美術線提供。姿勢預留：自然站立、雙手輕放身前。此處沒有替代角色或舊版角色。"
                : sheet === "sprout"
                  ? "這株原生嫩芽有自己的小角落。今天也來看看它吧。"
                  : sheet === "rabbit"
                    ? "兔兔僅在 Lv5 測試資料中顯示。本輪只驗證位置及等級門檻。"
                    : "樹屋只供 Lv5 位置測試，尚未提供內部功能。"}
            </Text>
            {sheet === "sprout" && (
              <ForestAction
                title={state.cared ? "已記錄本機關心" : "記錄本機關心"}
                disabled={state.cared}
                onPress={() => dispatch({ type: "care" })}
              />
            )}
            <Text style={t.note}>本機測試 · 不消耗能量、不增加資源。</Text>
          </>
        )}
      </DiegeticSheet>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#344634" },
  background: {
    ...StyleSheet.absoluteFill,
    width: "100%",
    height: "100%",
  },
  world: { position: "absolute" },
  hud: { position: "absolute", top: 16, left: 14, gap: 6 },
  forestName: {
    fontSize: 12,
    color: "#fbf2ce",
    letterSpacing: 3,
    textShadowColor: "#233e29",
    textShadowRadius: 5,
  },
  hudValues: {
    fontSize: 13,
    fontWeight: "500",
    color: "#fff4d6",
    textShadowColor: "#1c3224",
    textShadowRadius: 5,
  },
  testNote: {
    fontSize: 9,
    color: "#e3e7cf",
    textShadowColor: "#192d20",
    textShadowRadius: 4,
  },
  stump: { width: 80, height: 74, marginTop: 28 },
  sprout: { width: 64, height: 64 },
  slot: { position: "absolute" },
  slotTouch: {
    flex: 1,
    minWidth: 48,
    minHeight: 48,
    justifyContent: "flex-end",
    alignItems: "center",
    paddingBottom: 7,
    gap: 3,
  },
  groundShadow: {
    position: "absolute",
    bottom: 0,
    width: 68,
    height: 22,
    backgroundColor: "#30422655",
    borderRadius: 40,
  },
  slotMarker: {
    position: "absolute",
    bottom: 35,
    height: 44,
    width: 1,
    backgroundColor: "#f2edce66",
  },
  slotTitle: {
    color: "#fff7df",
    fontSize: 11,
    textShadowColor: "#263322",
    textShadowRadius: 5,
  },
  pending: {
    color: "#f6eed6",
    fontSize: 8,
    textShadowColor: "#263322",
    textShadowRadius: 4,
  },
  motion: {
    position: "absolute",
    bottom: 0,
    left: 2,
    fontSize: 8,
    color: "#f3edcd",
    textShadowColor: "#243b2c",
    textShadowRadius: 4,
  },
  load: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#e7e6cbf5",
    padding: 28,
    justifyContent: "center",
    gap: 20,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
  },
});
