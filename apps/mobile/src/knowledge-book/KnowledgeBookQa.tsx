import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { currentQuestion, QUESTIONS, taipeiDay, type PaperState } from "./flow";
import { qaStore } from "./store";

const labels: Record<PaperState, string> = { unanswered: "未作答", selected: "已選取", correct: "答對了", incorrect: "再學一點", completed: "已完成" };
type ButtonProps = { id: string; title: string; onPress: () => void; secondary?: boolean; disabled?: boolean };
function Button({ id, title, onPress, secondary, disabled }: ButtonProps) {
  return <Pressable testID={id} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.button, secondary && s.secondary, disabled && s.disabled, pressed && { opacity: 0.75 }]}>
    <Text style={[s.buttonText, secondary && s.secondaryText]}>{title}</Text>
  </Pressable>;
}

/** Only mounted behind the route's DEV/explicit QA gate. Reads actor level; never dispatches to the shared model. */
export function KnowledgeBookQa({ actorLevel, onReturnForest }: { actorLevel: number; onReturnForest: () => void }) {
  const state = useSyncExternalStore(qaStore.subscribe, qaStore.getSnapshot, qaStore.getSnapshot);
  const [fixture, setFixture] = useState<number | null>(null);
  const scroll = useRef<ScrollView>(null);
  const q = currentQuestion(state);
  const answered = ["correct", "incorrect", "completed"].includes(state.stage);
  const receipt = state.receipts.find(r => r.questionId === q?.id);
  const send = qaStore.dispatch;
  useEffect(() => { send({ type: "level", level: fixture ?? actorLevel }); }, [actorLevel, fixture]);
  useEffect(() => {
    const check = () => send({ type: "day", day: taipeiDay() });
    check(); const timer = setInterval(check, 30_000); return () => clearInterval(timer);
  }, []);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [state.questionId, state.stage]);
  const act = (action: Parameters<typeof send>[0]) => { send({ type: "day", day: taipeiDay() }); send(action); };
  const close = () => act({ type: "close" });

  return <SafeAreaView style={s.safe}>
    <View style={s.top}>
      <View style={s.topText}><Text style={s.eyebrow}>LOOPER / B 線 QA</Text><Text style={s.topTitle}>森林裡的知識小書</Text></View>
      <Pressable testID="kb-close" accessibilityRole="button" accessibilityLabel="關閉小書" onPress={close} style={s.close}><Text style={s.closeText}>關閉</Text></Pressable>
    </View>
    <ScrollView ref={scroll} testID="kb-scroll" contentContainerStyle={s.scroll}>
      <View style={s.content}>
        <View style={s.notice}><Text style={s.small}>測試版 · 僅記憶體答題 · 不結算 EXP／⭐／⚡</Text></View>
        <View style={s.meta}><Text testID="kb-count" style={s.metaText}>今日 QA 已答 {state.receipts.length} 題 · 前 2 題免費</Text><Text style={s.metaText}>Knowledge —</Text></View>
        <Text style={s.small}>⚡ 第 3 題起等待政策，扣除量與每日上限未定。</Text>

        {state.stage === "intro" && <View testID="kb-intro" style={s.intro}>
          <Text style={s.chapter}>FOREST · 閱讀角落</Text>
          <Image source={require("../../assets/forest-props/closed_knowledge_book.png")} style={s.book} resizeMode="contain" accessibilityLabel="既有森林小書入口圖；非 R2／R3 已整合圖" />
          <Text style={s.title}>每天，讀懂一點生活。</Text>
          <Text style={s.body}>打開小書，選一個答案，讀一段解說。這裡的作答只供工程驗收。</Text>
          <Button id="kb-open" title="打開知識小書" onPress={() => act({ type: "open" })} />
          {state.receipts.length > 0 && <Button secondary id="kb-resume" title="繼續下一題" onPress={() => act({ type: "open", questionId: QUESTIONS[Math.min(state.receipts.length, 2)].id })} />}
          {state.receipts.map((r, i) => <Button secondary key={r.questionId} id={`kb-review-${i}`} title={`重讀已完成的第 ${i + 1} 題`} onPress={() => act({ type: "open", questionId: r.questionId })} />)}
        </View>}

        {state.stage === "level-locked" && <View testID="kb-level-locked" style={s.paper}><Text style={s.chapter}>尚未解鎖</Text><Text style={s.title}>Lv3 開啟知識小書</Text><Text style={s.body}>目前為 Lv{state.level}。B 線不改變正式等級資格。</Text><Button id="kb-locked-back" title="回到小書入口" onPress={close} /></View>}

        {state.stage === "ENERGY_POLICY_PENDING" && <View testID="kb-policy-pending" style={s.paper}>
          <Text style={s.chapter}>ENERGY_POLICY_PENDING</Text><Text style={s.title}>今天先讀到這裡。</Text>
          <Text style={s.body}>前兩題的免費答題已完成。第三題的 ⚡ 扣除量與每日作答上限尚未定案。</Text>
          <Text style={s.body}>等待正式政策後才能繼續；本次沒有扣除能量，也沒有產生獎勵。</Text>
          <Button id="kb-pending-back" title="回顧已完成題目" onPress={close} />
        </View>}

        {q && ["unanswered", "selected", "correct", "incorrect", "completed"].includes(state.stage) && <View testID="kb-paper" style={[s.paper, state.stage === "correct" && s.correctPaper, state.stage === "incorrect" && s.incorrectPaper]}>
          <View style={s.paperHead}><Text style={s.chapter}>生活小知識 · {QUESTIONS.indexOf(q) + 1}</Text><Text testID="kb-paper-state" accessibilityLiveRegion="polite" style={s.state}>{labels[state.stage as PaperState]}</Text></View>
          <Text testID="kb-question" accessibilityRole="header" style={s.title}>{q.title}</Text>
          {q.illustration && <View testID="kb-illustration-pending" style={s.artSlot}><Text style={s.small}>惜食範例插畫：等待 R3 原始像素驗證</Text><Text style={s.small}>遮擋區不補繪；不套用至其他題目。</Text></View>}
          <View accessibilityRole="radiogroup" accessibilityLabel="四個答案選項" style={s.options}>
            {q.options.map((option, i) => <Pressable key={option} testID={`kb-option-${i}`} accessibilityRole="radio" accessibilityLabel={`${String.fromCharCode(65 + i)}，${option}`}
              accessibilityState={{ checked: state.selected === i, disabled: answered }} disabled={answered} onPress={() => act({ type: "select", option: i })}
              style={({ pressed }) => [s.option, state.selected === i && s.selectedOption, answered && q.answer === i && s.answerOption, answered && state.selected === i && !receipt?.correct && s.wrongOption, pressed && { opacity: 0.75 }]}>
              <Text style={s.optionLetter}>{String.fromCharCode(65 + i)}</Text><View style={s.optionCopy}><Text style={s.optionText}>{option}</Text>{answered && q.answer === i && <Text style={s.small}>正確答案</Text>}{answered && state.selected === i && <Text style={s.small}>你的選擇</Text>}</View>
            </Pressable>)}
          </View>
          {!answered && <Button id="kb-submit" title={state.selected === null ? "請先選擇一個答案" : "確認答案"} disabled={state.selected === null} onPress={() => act({ type: "submit" })} />}
          {answered && <View testID="kb-explanation" style={s.explanation}><Text accessibilityRole="header" style={s.explanationTitle}>{receipt?.correct ? "答對了，一起記住這件事。" : "沒關係，一起看看解說。"}</Text><Text style={s.body}>{q.explanation}</Text><Text style={s.small}>已記錄 1 次 QA 作答；沒有發放正式獎勵。</Text></View>}
          {answered && state.stage !== "completed" && <Button id="kb-complete" title="讀完了，完成這題" onPress={() => act({ type: "complete" })} />}
          {state.stage === "completed" && <Button id="kb-next" title="下一題" onPress={() => act({ type: "next" })} />}
        </View>}

        <View style={s.qaPanel}><Text style={s.chapter}>隔離驗收控制</Text><Text testID="kb-level" style={s.small}>目前 Lv{state.level} · {fixture === null ? "沿用 App 等級" : "僅 B 線 fixture"} · {state.day}</Text>
          <View style={s.fixtureRow}><View style={s.fixtureCell}><Button secondary id="kb-fixture-lv1" title="測試 Lv1" onPress={() => setFixture(1)} /></View><View style={s.fixtureCell}><Button secondary id="kb-fixture-lv3" title="測試 Lv3" onPress={() => setFixture(3)} /></View></View>
          <Button secondary id="kb-fixture-actor" title="恢復 App 等級" onPress={() => setFixture(null)} />
          <Text style={s.small}>R2／R3 原始 bytes 尚未取得，紙面目前以程式排版。ART_BLOCKED：缺真正未壓平書本母檔。此畫面不代表美術或 iPhone 驗收通過。</Text>
        </View>
        <Button secondary id="kb-return-forest" title="返回 Forest" onPress={() => { close(); onReturnForest(); }} />
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#e9eee4" }, top: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderColor: "#ced7c8", backgroundColor: "#f5f5ec" }, topText: { flex: 1 }, eyebrow: { fontSize: 10, letterSpacing: 2, color: "#526950" }, topTitle: { fontSize: 17, lineHeight: 25, color: "#243e30", fontWeight: "600" }, close: { minHeight: 48, minWidth: 56, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: "#b4c2ad" }, closeText: { color: "#304e3d", fontSize: 14 }, scroll: { padding: 16, paddingBottom: 28 }, content: { width: "100%", maxWidth: 600, alignSelf: "center", gap: 14 }, notice: { borderRadius: 8, padding: 10, backgroundColor: "#f5eacb" }, small: { fontSize: 12, lineHeight: 19, color: "#52604e" }, meta: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" }, metaText: { color: "#344d3b", fontSize: 12, lineHeight: 19, fontWeight: "600" }, intro: { borderRadius: 20, padding: 22, backgroundColor: "#f7f4e7", gap: 18 }, book: { width: "100%", height: 135 }, chapter: { fontSize: 11, lineHeight: 18, fontWeight: "600", letterSpacing: 1, color: "#607151" }, title: { fontSize: 24, lineHeight: 34, color: "#304332", fontWeight: "600" }, body: { fontSize: 15, lineHeight: 25, color: "#40533e" }, paper: { borderRadius: 18, borderWidth: 1, borderColor: "#d6c7a5", backgroundColor: "#fffae9", padding: 18, gap: 20 }, correctPaper: { borderColor: "#689276" }, incorrectPaper: { borderColor: "#bd8566" }, paperHead: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 6 }, state: { color: "#526747", fontSize: 12, lineHeight: 20, fontWeight: "600" }, artSlot: { borderWidth: 1, borderStyle: "dashed", borderColor: "#c8bd9f", borderRadius: 10, padding: 12, gap: 4 }, options: { gap: 10 }, option: { minHeight: 56, flexDirection: "row", alignItems: "center", padding: 12, gap: 12, borderWidth: 1, borderColor: "#d4cfb8", backgroundColor: "#fffdf4", borderRadius: 12 }, selectedOption: { borderColor: "#4b765b", backgroundColor: "#e6efdd", borderWidth: 2, padding: 11 }, answerOption: { borderColor: "#527d55", backgroundColor: "#e4eed9" }, wrongOption: { borderColor: "#a76748", backgroundColor: "#f5e5d9" }, optionLetter: { fontSize: 14, color: "#627454", fontWeight: "700" }, optionCopy: { flex: 1, gap: 2 }, optionText: { fontSize: 15, lineHeight: 23, color: "#344832" }, button: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, backgroundColor: "#355f48", alignItems: "center", justifyContent: "center" }, buttonText: { fontSize: 15, lineHeight: 22, fontWeight: "600", color: "#fffcef", textAlign: "center" }, secondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#96ab8b" }, secondaryText: { color: "#36523b" }, disabled: { opacity: 0.45 }, explanation: { borderTopWidth: 1, borderColor: "#d6c7a5", paddingTop: 18, gap: 10 }, explanationTitle: { fontSize: 17, lineHeight: 26, color: "#3b593a", fontWeight: "600" }, qaPanel: { borderRadius: 12, padding: 14, gap: 10, borderWidth: 1, borderColor: "#c1cdba" }, fixtureRow: { flexDirection: "row", gap: 10 }, fixtureCell: { flex: 1 },
});
