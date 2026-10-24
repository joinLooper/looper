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
  CHARACTER_SLOTS,
  demoJourney,
  RESOURCES,
  sceneVisibility,
} from "../src/model";
import { useDemo } from "../src/state";
import { SproutInfoContents } from "../src/sprout-info-ui";
import { APPROVED_F1_BACKGROUND } from "../src/f1-runtime-art.generated";
import type { SproutStage } from "../src/f1-sprout-assets";
import { QA_LEVEL_GATE_ENABLED, qaWorld } from "../src/qa-levels";
import { FOREST_PROPS, illustratedChecklistSources } from "../src/forest-art";
import {f1ViewportFrame, f1InsetImageFrame} from "../src/f1-scene-projection";
import {F1QaHudPreview} from "../src/f1-qa-hud-preview";
import {QA_F1_TWO_ROW_HUD_ART} from "../src/f1-qa-hud-art.generated";
// Legacy square-world placement is not used by V-F1 cover art.
import {
  DiegeticSheet,
  ForestAction,
  ForestPropButton,
  forestText as t,
} from "../src/forest-ui";
type Sheet =
  | "mission"
  | "progress"
  | "knowledge"
  | "backpack"
  | "marmot"
  | "sprout"
  | "rabbit"
  | "treehouse"
  | "tools"
  | null;
export default function Forest({ initialSheet = null }: { initialSheet?: Sheet }) {
  const { state, dispatch, reduced } = useDemo();
  const qa = state.qaPreview && QA_LEVEL_GATE_ENABLED ? qaWorld(state.level) : null;
  const resources = qa ?? RESOURCES;
  const knowledgeAllowed = !qa || qa.knowledge;
  const insets = useSafeAreaInsets();
  const [area, setArea] = useState({ width: 360, height: 640 });
  const [sheet, setSheet] = useState<Sheet>(initialSheet === "knowledge" && !knowledgeAllowed ? null : initialSheet);
  const [qaSproutStage, setQaSproutStage] = useState<SproutStage>(1);
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
  useEffect(() => {
    setSheet(initialSheet === "knowledge" && !knowledgeAllowed ? null : initialSheet);
    setPreviewState("ready");
  }, [state.level, state.qaPreview, initialSheet, knowledgeAllowed]);
  const journey = demoJourney(state);
  const approvedArt = illustratedChecklistSources(state);
  const visible = sceneVisibility(state.level);
  // Single transform for the visible 941x1672 background and all its props.
  const frame=(key:Parameters<typeof f1ViewportFrame>[0])=>f1ViewportFrame(key,area.width,area.height);
  const artFrame=(key:Parameters<typeof f1ViewportFrame>[0])=>f1InsetImageFrame(frame(key));
  const hudCandidateVisible=QA_LEVEL_GATE_ENABLED && QA_F1_TWO_ROW_HUD_ART !== null;
  function closeSheet() {
    // Direct /knowledge and /progress routes are scene-preserving aliases.
    // Closing either returns to Forest, not a generic content page.
    if (initialSheet !== null) {
      router.dismissTo("/forest");
      return;
    }
    setSheet(null);
  }
  function open(next: Sheet) {
    if (next === "knowledge" && !knowledgeAllowed) return;
    if (next === "sprout") setQaSproutStage(1);
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
        source={APPROVED_F1_BACKGROUND ?? require("../assets/forest-clearing.png")}
        style={styles.background}
        resizeMode="cover"
        onLoad={() => setImageReady(true)}
        onError={() => setFailure(true)}
        accessible={false}
      />

      <View
        style={[
          styles.world,
          { top: 0, bottom: 0, left: 0, right: 0 },
        ]}
        onLayout={(e) => setArea(e.nativeEvent.layout)}
        accessibilityElementsHidden={sheet !== null}
        importantForAccessibility={sheet ? "no-hide-descendants" : "auto"}
      >
        <F1QaHudPreview
          width={area.width} height={area.height} topSafe={insets.top}
          level={state.level} exp={resources.exp} stars={resources.stars}
          energy={resources.energy} energyVisible={state.level>=3}
          source={QA_F1_TWO_ROW_HUD_ART} qaAllowed={QA_LEVEL_GATE_ENABLED}
        />
        <View pointerEvents="none" style={[styles.hud,{top:insets.top+12,display:hudCandidateVisible?"none":"flex"}]}>
          <Text style={styles.forestName}>晨 光 森 林</Text>
          <Text testID="forest-level-hud" style={styles.hudValues}>
            Lv{state.level} · EXP {resources.exp}{qa ? (qa.nextExp === null ? " · MAX" : " / " + qa.nextExp) : ""}
          </Text>
          <Text testID="forest-resource-hud" style={styles.hudValues}>
            ⭐ {resources.stars}{state.level>=3 ? " · ⚡ " + resources.energy : ""}{qa ? " · CO₂e 0 kg" : ""}
          </Text>
          <Text style={styles.testNote}>{qa ? "QA 預置 · 場景未齊 · 角色待美術" : "本機測試 · 固定資源 · 角色待美術"}</Text>
          {!APPROVED_F1_BACKGROUND && <Text testID="forest-background-source-pending" style={styles.testNote}>正式 F1 底圖原件待匯入，暫用舊版測試背景</Text>}
          {qa?.chapterComplete && <Text testID="qa-chapter-marker" style={styles.testNote}>QA：第一章完成旗標 · 回憶／完成畫面待接入</Text>}
        </View>
        <View
          testID="forest-scene"
          pointerEvents="box-none"
          style={StyleSheet.absoluteFill}
          accessibilityLabel="1000乘1000邏輯座標森林"
        >
          {knowledgeAllowed ? <ForestPropButton
            kind="book"
            imageSource={FOREST_PROPS.knowledge}
            imageStyle={artFrame("knowledge")}
            label="左側樹樁：每日知識"
            testID="stump-hotspot"
            reduced={reduced}
            onPress={() => open("knowledge")}
            style={frame("knowledge")}
          /> : <View testID="qa-knowledge-locked" style={[frame("knowledge"), {position: "absolute", alignItems: "center"}]}><Text style={styles.pending}>知識 Lv3 解鎖</Text></View>}
          <Animated.View
            style={[
              styles.slot,
              frame("marmot"),
              { transform: [{ scale: pulse }] },
            ]}
          >
            <View pointerEvents="none" style={styles.groundShadow} />
            <View pointerEvents="none" style={styles.slotMarker} />
            <Pressable
              testID="marmot-slot"
              accessibilityRole="button"
              accessibilityLabel="土撥鼠位置，正式美術待提供"
              onPress={() => open("marmot")}
              style={({ pressed }) => [
                styles.slotTouch,
                styles.marmotQaTouch,
                { opacity: pressed ? 0.65 : 1 },
              ]}
            >
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
            style={frame("sprout")}
          >
            <Image
              source={require("../assets/sprout.png")}
              style={{width:frame("sprout").width,height:frame("sprout").height}}
              resizeMode="contain"
            />
          </ForestPropButton>
          <ForestPropButton
            kind="wood"
            imageSource={approvedArt.sign}
            imageStyle={artFrame("mission")}
            label="任務"
            testID="open-progress"
            reduced={reduced}
            onPress={() => open("mission")}
            style={frame("mission")}
          />
          {/* The approved B07 pouch art stays at its full original frame.
              Only the pressable body area is narrowed to avoid overlap with
              the central sprout on tall iPhones. */}
          <View pointerEvents="box-none" style={[styles.slot,frame("backpack")]}>
            <Pressable
              testID="open-backpack"
              accessibilityRole="button"
              accessibilityLabel="背包與收藏"
              onPress={() => open("backpack")}
              style={styles.backpackQaTouch}
            >
              {/* Maintain the full image canvas as a button descendant,
                  but offset it back to the original approved B07 frame. */}
              <View
                pointerEvents="none"
                style={{
                  position:"absolute",
                  left:-frame("backpack").width*0.48,
                  top:-frame("backpack").height*0.43,
                  width:frame("backpack").width,
                  height:frame("backpack").height,
                }}
              >
                <Image
                  source={FOREST_PROPS.backpack}
                  style={{
                    width:frame("backpack").width,
                    height:frame("backpack").height,
                  }}
                  resizeMode="contain"
                  accessible={false}
                />
              </View>
            </Pressable>
          </View>
          <ForestPropButton
            kind="stone"
            imageSource={FOREST_PROPS.tools}
            imageStyle={artFrame("tools")}
            label="更多與設定"
            testID="open-tools"
            reduced={reduced}
            onPress={() => open("tools")}
            style={frame("tools")}
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
                frame("rabbit"),
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
              style={frame("treehouse")}
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
              onPress={() => router.dismissTo("/")}
            />
          </View>
        )}
      </View>
      <DiegeticSheet
        visible={sheet !== null}
        artwork={sheet === "mission" || sheet === "progress" ? approvedArt.journal : undefined}
        surface={
          sheet === "mission" || sheet === "progress" ? "journal" :
          sheet === "knowledge" ? "knowledge" :
          sheet === "backpack" ? "pouch" :
          sheet === "tools" ? "tools" : "other"
        }
        propArt={
          sheet === "backpack" ? FOREST_PROPS.backpack :
          sheet === "tools" ? FOREST_PROPS.tools : undefined
        }
        reduced={reduced}
        onClose={closeSheet}
      >
        {sheet === "mission" || sheet === "progress" ? (
          <>
            <Text accessibilityRole="header" style={t.title}>
              {sheet === "progress" ? "森林日常與我的進度" : "今天，帶著杯子出發"}
            </Text>
            {sheet === "progress" && (
              <View testID="world-progress-summary" style={styles.progressSummary}>
                <Text style={t.body}>Lv{state.level} · 森林居民</Text>
                <Text style={t.note}>EXP {resources.exp}　⭐ {resources.stars}{state.level>=3 ? "　⚡ " + resources.energy : ""}{qa ? "　CO₂e 0 kg" : ""}</Text>
                <Text style={t.note}>固定測試資源 · 不連線正式帳號與帳本</Text>
              </View>
            )}
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
            {sheet === "mission" && (
              <ForestAction
                title="查看任務與玩家進度"
                testID="open-world-progress"
                onPress={() => setSheet("progress")}
              />
            )}
          </>
        ) : sheet === "knowledge" && knowledgeAllowed ? (
          <>
            <View style={styles.knowledgeIntro}>
              <View style={styles.knowledgeIntroText}>
                <Text style={t.note}>樹樁旁的小發現 · 01</Text>
                <Text accessibilityRole="header" style={t.title}>
                  一個杯子的旅行
                </Text>
              </View>
            </View>
            <Text style={t.body}>一個小習慣，也能讓日常更輕盈。</Text>
            <Text style={t.body}>
              每天買飲料，怎麼做能減少一次性垃圾？
            </Text>
            <Text style={t.note}>在森林的小書裡選一個答案：</Text>
            <View style={styles.knowledgeChoices}>
              <ForestAction
                title="帶自己的杯子，清洗後重複使用"
                variant="choice"
                testID="answer-reuse"
                disabled={state.answer === "reuse"}
                onPress={() => dispatch({ type: "answer", answer: "reuse" })}
              />
              <ForestAction
                title="每天再拿一個一次性杯子"
                variant="choice"
                testID="answer-single"
                disabled={state.answer === "reuse"}
                onPress={() => dispatch({ type: "answer", answer: "single-use" })}
              />
            </View>
            {state.answer && (
              <Text
                testID="knowledge-feedback"
                accessibilityLiveRegion="polite"
                style={t.feedback}
              >
                {state.answer === "reuse"
                  ? "答對了。讓杯子多陪你幾次，就能減少一次性垃圾。"
                  : "再想一想：哪個選擇能讓同一個杯子使用更多次？"}
              </Text>
            )}
            <Text style={t.note}>
              本機示範 · 不發放 EXP、星星或其他資源。
            </Text>
          </>
        ) : sheet === "backpack" ? (
          <>
            <Text accessibilityRole="header" style={t.title}>
              樹下的小布包
            </Text>
            <Text style={t.body}>小布包還空空的，等著收進森林裡的小發現。</Text>
            <Text style={t.note}>
              收藏功能仍在準備中。這個布包目前只供探索。
            </Text>
          </>
        ) : sheet === "tools" ? (
          <>
            <Text accessibilityRole="header" style={t.title}>
              森林小記
            </Text>
            <Text style={t.note}>本機測試工具 · 不連線正式服務</Text>
            {QA_LEVEL_GATE_ENABLED && <ForestAction title="返回 QA 等級選單" testID="return-qa-levels" onPress={() => { setSheet(null); router.replace("/qa-levels"); }} />}
            {qa && <View testID="qa-world-gaps">{qa.gaps.map(gap => <Text key={gap} style={t.note}>{gap}</Text>)}</View>}
            <ForestAction
              title="查看玩家進度"
              testID="open-world-progress"
              onPress={() => setSheet("progress")}
            />
            {((typeof __DEV__ !== "undefined" && __DEV__) ||
              process.env.EXPO_PUBLIC_ENABLE_QA_LEVELS === "1") && (
              <ForestAction
                title="QA：事件與畫面點擊路徑"
                testID="open-qa-event-flows"
                onPress={() => { setSheet(null); router.push("/qa-events"); }}
              />
            )}
            {!qa && <><ForestAction
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
            </>}
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
                dispatch(qa ? { type: "qa-level", level: state.level } : { type: "reset" });
                setPreviewState("ready");
                setSheet(null);
              }}
            />
            <ForestAction
              title="回到歡迎頁"
              testID="return-welcome"
              onPress={() => {
                // A modal overlay must unmount with Forest. dismissTo("/") can
                // dismiss the native activity stack rather than presenting
                // Welcome when Forest is the root of a replaced QA route.
                setSheet(null);
                router.replace("/");
              }}
            />
          </>
        ) : sheet === "sprout" ? (
          <>
            <SproutInfoContents
              qaMode={Boolean(qa)}
              selectedStage={qaSproutStage}
              onSelectStage={setQaSproutStage}
            />
            <ForestAction
              title={state.cared ? "已記錄本機關心" : "記錄本機關心"}
              testID="record-sprout-care"
              disabled={state.cared}
              onPress={() => dispatch({ type: "care" })}
            />
          </>
        ) : (
          <>
            <Text accessibilityRole="header" style={t.title}>
              {sheet === "marmot"
                ? "在這裡，慢慢來。"
                : sheet === "rabbit"
                    ? "兔兔 · Lv5 角色插槽"
                    : "樹屋入口 · Lv5"}
            </Text>
            <Text style={t.body}>
              {sheet === "marmot"
                ? "土撥鼠正式圖像待美術線提供。姿勢預留：自然站立、雙手輕放身前。此處沒有替代角色或舊版角色。"
                : sheet === "rabbit"
                    ? "兔兔在 Lv5 以上測試資料中顯示。本輪只驗證位置及等級門檻。"
                    : "樹屋已達 Lv5 解鎖門檻；目前只供入口位置測試，內部、小舖及生活結構尚未接入。"}
            </Text>
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
  // Pouch body only: keep the original sprite at full size and same position.
  backpackQaTouch: {
    position: "absolute",left:"48%",top:"43%",width:"52%",height:"57%",
    minWidth:48,minHeight:48,
  },
  // QA-only tap target: upper half, so it cannot overlap the sprout tap area.
  marmotQaTouch: {
    position: "absolute", top: "4%", left: "8%", width: "84%", height: "50%", flex: 0,
    justifyContent: "center", paddingBottom: 0, minHeight: 48, minWidth: 48,
  },
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
  progressSummary: {
    paddingVertical: 10,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#c8bea1",
  },
  knowledgeIntro: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 8,
    borderBottomColor: "#c8bea1",
    borderBottomWidth: 1,
  },
  knowledgeIcon: { width: 74, height: 86 },
  knowledgeIntroText: { flex: 1, gap: 4 },
  knowledgeChoices: {
    gap: 5,
    paddingHorizontal: 4,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
  },
});
