import React, { useState } from "react";
import {
  Modal,
  Image,
  Pressable,
  ScrollView,
  useWindowDimensions,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
  type ImageSourcePropType,
  type ImageStyle,
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
  imageSource,
  imageStyle,
}: {
  kind: "wood" | "book" | "bag" | "stone" | "plant";
  label: string;
  testID: string;
  onPress: () => void;
  style: ViewStyle;
  children?: React.ReactNode;
  reduced: boolean;
  imageSource?: ImageSourcePropType;
  imageStyle?: ImageStyle;
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
      {imageSource && (
        <Image
          source={imageSource}
          style={[f.propImage, imageStyle]}
          resizeMode="contain"
          accessible={false}
        />
      )}
      {!imageSource && kind === "wood" && (
        <>
          <View style={f.post} />
          <View style={f.wood}>
            <Text style={f.pin}>·</Text>
            <Text style={f.woodText}>{label}</Text>
            <View style={f.grain} />
          </View>
        </>
      )}
      {!imageSource && kind === "book" && (
        <View style={f.book}>
          <View style={f.page}>
            <Text style={f.bookText}>知識</Text>
            <Text style={f.leaf}>❧</Text>
          </View>
          <View style={f.bookmark} />
        </View>
      )}
      {!imageSource && kind === "bag" && (
        <>
          <View style={f.strap} />
          <View style={f.bag}>
            <View style={f.flap} />
            <Text style={f.bagText}>背包</Text>
            <View style={f.seam} />
          </View>
        </>
      )}
      {!imageSource && kind === "stone" && (
        <View style={f.stone}>
          <Text style={f.stoneText}>更多</Text>
        </View>
      )}
      {!imageSource && kind === "plant" && <Text style={f.groundLabel}>{label}</Text>}
    </Pressable>
  );
}
export function ForestAction({
  title,
  onPress,
  testID,
  disabled = false,
  variant = "plain",
}: {
  title: string;
  onPress: () => void;
  testID?: string;
  disabled?: boolean;
  variant?: "plain" | "choice";
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
        variant === "choice" ? f.choiceAction : undefined,
        pressed && variant === "choice" ? f.choicePressed : undefined,
        { opacity: disabled ? 0.55 : pressed ? 0.75 : 1 },
      ]}
    >
      <Text style={[f.actionText, variant === "choice" ? f.choiceText : undefined]}>
        {variant === "choice" ? "◦ " : "❧ "}{title}
      </Text>
    </Pressable>
  );
}
/** Unified forest-book containers. Approved game props stay unchanged. */
export type WorldSurface = "journal" | "knowledge" | "pouch" | "tools" | "other";
export function DiegeticSheet({
  visible,
  reduced,
  onClose,
  children,
  artwork,
  surface = "other",
  propArt,
}: {
  visible: boolean;
  reduced: boolean;
  onClose: () => void;
  children: React.ReactNode;
  artwork?: ImageSourcePropType;
  surface?: WorldSurface;
  propArt?: ImageSourcePropType;
}) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const notebookWidth = Math.min(440, Math.max(240, screenWidth - 24));
  const artHeight = Math.min(notebookWidth / 1.5, screenHeight * 0.34);
  const hasApprovedJournal = Boolean(artwork);
  const hasKnowledgePages = surface === "knowledge";
  const isPouch = surface === "pouch";
  const isTools = surface === "tools";
  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? "none" : "fade"}
      onRequestClose={onClose}
    >
      <SafeAreaView style={[f.scrim, hasApprovedJournal ? f.artScrim : undefined]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="收起森林手札"
        />
        <View
          testID="forest-notebook"
          accessibilityViewIsModal
          style={[
            f.notebook,
            hasApprovedJournal ? f.artNotebook : undefined,
            hasKnowledgePages ? f.knowledgeNotebook : undefined,
            isPouch ? f.pouchNotebook : undefined,
            isTools ? f.toolsNotebook : undefined,
          ]}
        >
          {hasApprovedJournal ? (
            <>
              {/* The original B07 checklist and all eight states remain pixel-exact.
                  This single lower page continues beneath the approved illustration. */}
              <Image
                testID="task-journal-art"
                source={artwork}
                resizeMode="contain"
                style={[f.journalArt, { height: artHeight }]}
                accessible={false}
              />
              <ScrollView
                testID="worldbook-page"
                style={f.artNotebookScroll}
                contentContainerStyle={f.artPages}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={f.chapter}>LOOPER · 森林生活手札</Text>
                {children}
                <ForestAction
                  title="收起手札 · 返回森林"
                  testID="close-sheet"
                  onPress={onClose}
                />
              </ScrollView>
            </>
          ) : (
            <>
              {hasKnowledgePages ? (
                <View testID="knowledge-open-pages" pointerEvents="none" style={f.knowledgePages}>
                  <View style={[f.knowledgeTopPage, f.knowledgeTopLeft]}>
                    <View style={f.knowledgeLeafMark} />
                    <View style={f.knowledgeGuideLine} />
                    <View style={[f.knowledgeGuideLine, f.knowledgeGuideShort]} />
                  </View>
                  <View style={[f.knowledgeTopPage, f.knowledgeTopRight]}>
                    <View style={f.knowledgeCircleMark} />
                    <View style={[f.knowledgeGuideLine, f.knowledgeGuideShort]} />
                  </View>
                  <View style={f.knowledgeCenterSeam} />
                </View>
              ) : null}
              {propArt && !hasKnowledgePages ? (
                <Image
                  source={propArt}
                  resizeMode="contain"
                  style={[f.sheetPropArt, isPouch ? f.pouchArt : undefined]}
                  accessible={false}
                />
              ) : null}
              {!hasKnowledgePages && !propArt ? (
                <>
                  <View pointerEvents="none" style={f.spine} />
                  <View pointerEvents="none" style={f.ribbon} />
                </>
              ) : null}
              <ScrollView
                testID={hasKnowledgePages ? "knowledge-page-surface" : undefined}
                style={[
                  hasKnowledgePages ? f.knowledgeScroll : undefined,
                  isPouch ? f.pouchScroll : undefined,
                  isTools ? f.toolsScroll : undefined,
                ]}
                contentContainerStyle={[
                  f.pages,
                  hasKnowledgePages ? f.knowledgeContent : undefined,
                  isPouch || isTools ? f.propContent : undefined,
                ]}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={f.chapter}>
                  {hasKnowledgePages ? "林間知識 · 生活小發現" : isPouch ? "森林收藏 · 小布包" : "LOOPER / 林間手札"}
                </Text>
                {children}
                <ForestAction
                  title={hasKnowledgePages ? "闔上小書 · 返回森林" : "收起手札 · 返回森林"}
                  testID="close-sheet"
                  onPress={onClose}
                />
              </ScrollView>
            </>
          )}
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
    overflow: "visible",
    alignItems: "center",
    justifyContent: "center",
  },
  propImage: { position: "absolute" },
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
  artScrim: { padding: 12 },
  artNotebook: {
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
    overflow: "visible",
  },
  // The B07 picture is unchanged and sits over a single page continuing
  // from its lower edge. No separate bordered dashboard card is displayed.
  journalArt: {
    width: "100%",
    alignSelf: "center",
    flexGrow: 0,
    flexShrink: 0,
    zIndex: 2,
  },
  artNotebookScroll: {
    flexShrink: 1,
    minHeight: 112,
    marginTop: -52,
    marginHorizontal: 26,
    marginBottom: 3,
    backgroundColor: "#f8ead0",
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 7,
    borderColor: "#708b60",
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    zIndex: 1,
  },
  artPages: { padding: 14, paddingTop: 30, paddingBottom: 24, gap: 14 },
  knowledgeNotebook: {
    backgroundColor: "#617b58",
    borderRadius: 30,
    borderWidth: 0,
    borderBottomWidth: 10,
    borderBottomColor: "#476a4c",
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 10,
    overflow: "hidden",
  },
  // An open folio silhouette in native geometry, not a mock screenshot
  // or a fake replacement for the approved closed-book forest prop.
  knowledgePages: {
    height: 77,
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: -9,
    marginHorizontal: 2,
  },
  knowledgeTopPage: {
    flex: 1,
    backgroundColor: "#fff1d2",
    paddingHorizontal: 18,
    paddingTop: 18,
    gap: 6,
    borderColor: "#d5c19b",
    borderBottomWidth: 3,
  },
  knowledgeTopLeft: {
    borderTopLeftRadius: 25,
    borderBottomLeftRadius: 8,
    transform: [{ rotate: "-2deg" }],
  },
  knowledgeTopRight: {
    borderTopRightRadius: 25,
    borderBottomRightRadius: 8,
    transform: [{ rotate: "2deg" }],
  },
  knowledgeCenterSeam: {
    position: "absolute",
    top: 0,
    bottom: -3,
    width: 7,
    backgroundColor: "#dfc9a3",
    borderRadius: 4,
    alignSelf: "center",
  },
  knowledgeLeafMark: {
    width: 23,
    height: 16,
    borderTopLeftRadius: 24,
    borderBottomRightRadius: 24,
    backgroundColor: "#93ae72",
    transform: [{ rotate: "-25deg" }],
  },
  knowledgeCircleMark: {
    width: 16,
    height: 16,
    borderRadius: 16,
    backgroundColor: "#d9bd76",
  },
  knowledgeGuideLine: { width: "65%", height: 3, borderRadius: 3, backgroundColor: "#e0d0af" },
  knowledgeGuideShort: { width: "38%" },
  knowledgeScroll: {
    flexShrink: 1,
    minHeight: 160,
    backgroundColor: "#fff1d2",
    borderTopWidth: 0,
    borderRightWidth: 2,
    borderRightColor: "#d9c3a2",
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 22,
    borderLeftWidth: 6,
    borderLeftColor: "#d8be91",
  },
  knowledgeContent: { padding: 21, paddingTop: 25, gap: 17 },
  sheetPropArt: {
    width: 120,
    height: 112,
    alignSelf: "center",
    marginTop: -9,
    zIndex: 2,
    marginBottom: -13,
  },
  pouchArt: { height: 120, width: 132 },
  pouchNotebook: {
    borderRadius: 28,
    backgroundColor: "#ebe2c6",
    borderWidth: 5,
    borderColor: "#9da687",
    overflow: "hidden",
  },
  toolsNotebook: {
    borderRadius: 26,
    backgroundColor: "#e7ddc0",
    borderWidth: 5,
    borderColor: "#998567",
    overflow: "hidden",
  },
  pouchScroll: {
    flexShrink: 1,
    backgroundColor: "#fff2d9",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
  },
  toolsScroll: {
    flexShrink: 1,
    backgroundColor: "#f6e9cd",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  propContent: { padding: 24, paddingTop: 25, gap: 17 },
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
  choiceAction: {
    minHeight: 58,
    borderWidth: 2,
    borderColor: "#dcc79e",
    borderBottomWidth: 5,
    borderBottomColor: "#c7b082",
    backgroundColor: "#f8e8c8",
    borderRadius: 18,
    paddingHorizontal: 16,
    marginVertical: 4,
  },
  choicePressed: {
    borderBottomWidth: 2,
    backgroundColor: "#ecdfb9",
  },
  choiceText: {
    color: "#385a3d",
    fontSize: 16,
    lineHeight: 25,
    fontWeight: "600",
  },
});
