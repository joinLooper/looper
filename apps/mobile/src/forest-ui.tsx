import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** Native-drawn prop studies, not approved final prop art. */
export function ForestPropButton({
  kind,
  label,
  testID,
  onPress,
  style,
  children,
  reduced,
}: {
  kind: "wood" | "book" | "bag" | "stone" | "plant";
  label: string;
  testID: string;
  onPress: () => void;
  style: ViewStyle;
  children?: React.ReactNode;
  reduced: boolean;
}) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={({ pressed }) => [
        f.prop,
        style,
        {
          opacity: pressed ? 0.78 : 1,
          transform: [{ scale: !reduced && (pressed || hover) ? 1.04 : 1 }],
        },
        focus && f.focus,
      ]}
    >
      {children}
      {kind === "wood" && (
        <>
          <View style={f.post} />
          <View style={f.wood}>
            <Text style={f.pin}>·</Text>
            <Text style={f.woodText}>{label}</Text>
            <View style={f.grain} />
          </View>
        </>
      )}
      {kind === "book" && (
        <View style={f.book}>
          <View style={f.page}>
            <Text style={f.bookText}>知識</Text>
            <Text style={f.leaf}>❧</Text>
          </View>
          <View style={f.bookmark} />
        </View>
      )}
      {kind === "bag" && (
        <>
          <View style={f.strap} />
          <View style={f.bag}>
            <View style={f.flap} />
            <Text style={f.bagText}>背包</Text>
            <View style={f.seam} />
          </View>
        </>
      )}
      {kind === "stone" && (
        <View style={f.stone}>
          <Text style={f.stoneText}>更多</Text>
        </View>
      )}
      {kind === "plant" && <Text style={f.groundLabel}>{label}</Text>}
    </Pressable>
  );
}
export function ForestAction({
  title,
  onPress,
  testID,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  testID?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        f.action,
        { opacity: disabled ? 0.55 : pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={f.actionText}>❧ {title}</Text>
    </Pressable>
  );
}
export function DiegeticSheet({
  visible,
  reduced,
  onClose,
  children,
}: {
  visible: boolean;
  reduced: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? "none" : "fade"}
      onRequestClose={onClose}
    >
      <SafeAreaView style={f.scrim}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="收起手札"
        />
        <View
          testID="forest-notebook"
          accessibilityViewIsModal
          style={f.notebook}
        >
          <View pointerEvents="none" style={f.spine} />
          <View pointerEvents="none" style={f.ribbon} />
          <ScrollView
            contentContainerStyle={f.pages}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={f.chapter}>LOOPER / 林間手札</Text>
            {children}
            <ForestAction
              title="收起手札 · 返回森林"
              testID="close-sheet"
              onPress={onClose}
            />
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
export const forestText = StyleSheet.create({
  title: { fontSize: 25, lineHeight: 36, color: "#3c422b", fontWeight: "600" },
  body: { fontSize: 16, lineHeight: 28, color: "#596047" },
  note: { fontSize: 12, lineHeight: 21, color: "#6b725a" },
  feedback: {
    fontSize: 16,
    lineHeight: 27,
    color: "#345b36",
    fontWeight: "600",
  },
});
const f = StyleSheet.create({
  prop: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  focus: { borderWidth: 2, borderColor: "#fff3b5", borderRadius: 16 },
  post: {
    position: "absolute",
    width: 9,
    height: 62,
    top: 22,
    backgroundColor: "#795837",
    borderRadius: 3,
    transform: [{ rotate: "-6deg" }],
  },
  wood: {
    backgroundColor: "#b18a55",
    borderColor: "#dbb879",
    borderTopWidth: 2,
    borderBottomWidth: 5,
    borderBottomColor: "#69513b",
    paddingHorizontal: 17,
    paddingBottom: 9,
    borderRadius: 5,
    transform: [{ rotate: "-7deg" }],
  },
  pin: { color: "#e9d5a4", textAlign: "center", fontSize: 19, lineHeight: 13 },
  woodText: {
    color: "#fff3d4",
    fontWeight: "700",
    fontSize: 14,
    letterSpacing: 3,
  },
  grain: { marginTop: 4, width: 40, height: 1, backgroundColor: "#cfa86d" },
  book: {
    position: "absolute",
    top: 5,
    width: 55,
    height: 57,
    borderRadius: 4,
    backgroundColor: "#597359",
    padding: 4,
    borderLeftWidth: 5,
    borderLeftColor: "#344c3b",
    transform: [{ rotate: "-12deg" }],
  },
  page: {
    flex: 1,
    backgroundColor: "#f0e6bc",
    borderRadius: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  bookText: { color: "#496044", fontSize: 11, fontWeight: "600" },
  leaf: { fontSize: 22, color: "#7b8e57", lineHeight: 25 },
  bookmark: {
    width: 6,
    height: 18,
    backgroundColor: "#bca364",
    position: "absolute",
    right: 8,
    bottom: -7,
  },
  strap: {
    position: "absolute",
    top: 4,
    width: 32,
    height: 33,
    borderWidth: 4,
    borderColor: "#b4a777",
    borderRadius: 20,
  },
  bag: {
    width: 57,
    height: 57,
    backgroundColor: "#bcb18b",
    borderRadius: 18,
    borderBottomWidth: 4,
    borderColor: "#7c7957",
    alignItems: "center",
    transform: [{ rotate: "9deg" }],
  },
  flap: {
    width: 47,
    height: 17,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    backgroundColor: "#d7cca7",
    borderBottomWidth: 1,
    borderColor: "#908569",
  },
  bagText: { color: "#4b503c", fontSize: 11, marginTop: 4 },
  seam: {
    width: 35,
    borderBottomWidth: 1,
    borderStyle: "dashed",
    borderColor: "#f2e6bc",
    marginTop: 4,
  },
  stone: {
    backgroundColor: "#8b9676",
    borderRadius: 24,
    borderTopLeftRadius: 14,
    borderBottomWidth: 4,
    borderColor: "#515e4b",
    paddingHorizontal: 13,
    paddingVertical: 10,
    transform: [{ rotate: "8deg" }],
  },
  stoneText: { fontSize: 12, color: "#fff2cc", letterSpacing: 2 },
  groundLabel: {
    color: "#fff5d8",
    fontSize: 11,
    textShadowColor: "#263827",
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  scrim: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#172a245e",
  },
  notebook: {
    width: "100%",
    maxWidth: 440,
    maxHeight: "90%",
    backgroundColor: "#e9dfba",
    borderRadius: 9,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 28,
    borderRightWidth: 5,
    borderBottomWidth: 7,
    borderColor: "#b5aa83",
    shadowColor: "#18251b",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.3,
    shadowRadius: 22,
    elevation: 12,
    overflow: "hidden",
  },
  spine: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 11,
    backgroundColor: "#7a8b61",
    borderRightWidth: 2,
    borderColor: "#c5c39a",
  },
  ribbon: {
    position: "absolute",
    top: 0,
    right: 25,
    height: 28,
    width: 15,
    backgroundColor: "#7c9363",
  },
  pages: { padding: 28, paddingLeft: 32, gap: 17 },
  chapter: {
    color: "#77815f",
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 6,
  },
  action: {
    minHeight: 48,
    borderBottomWidth: 1,
    borderColor: "#c1bd94",
    justifyContent: "center",
    paddingVertical: 10,
  },
  actionText: {
    color: "#3c5c3b",
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "600",
  },
});
