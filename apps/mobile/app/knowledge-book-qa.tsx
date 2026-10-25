import React from "react";
import { Redirect, router } from "expo-router";
import { qaEnabled } from "../src/knowledge-book/flow";
import { KnowledgeBookQa } from "../src/knowledge-book/KnowledgeBookQa";
import { useDemo } from "../src/state";

export default function KnowledgeBookQaRoute() {
  const { state } = useDemo();
  if (!qaEnabled(typeof __DEV__ !== "undefined" && __DEV__, process.env.EXPO_PUBLIC_ENABLE_KNOWLEDGE_BOOK_QA)) return <Redirect href="/forest" />;
  return <KnowledgeBookQa actorLevel={state.level} onReturnForest={() => router.replace("/forest")} />;
}
