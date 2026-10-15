import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useState,
} from "react";
import { AccessibilityInfo } from "react-native";
import {
  demoReducer,
  INITIAL_STATE,
  type Action,
  type DemoState,
} from "./model";
const DemoContext = createContext<{
  state: DemoState;
  dispatch: React.Dispatch<Action>;
  reduced: boolean;
} | null>(null);
export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(demoReducer, INITIAL_STATE);
  // Default to no motion until the OS setting is resolved.
  const [systemReduced, setSystemReduced] = useState(true);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (active) setSystemReduced(v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setSystemReduced,
    );
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
  return (
    <DemoContext.Provider
      value={{ state, dispatch, reduced: systemReduced || state.reduceMotion }}
    >
      {children}
    </DemoContext.Provider>
  );
}
export function useDemo() {
  const value = useContext(DemoContext);
  if (!value) throw new Error("DemoProvider required");
  return value;
}
