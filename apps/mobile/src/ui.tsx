import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
export const colors = {
  ink: "#213E35",
  muted: "#536B60",
  cream: "#F5F4EB",
  green: "#315C48",
  line: "#D9E2D7",
  paper: "#FFFEF7",
  soft: "#E9EFDF",
};
export function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
  testID,
  style,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  testID?: string;
  style?: ViewStyle;
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
        s.button,
        secondary && s.secondary,
        pressed && { opacity: 0.7 },
        disabled && { opacity: 0.55 },
        style,
      ]}
    >
      <Text style={[s.buttonText, secondary && { color: colors.ink }]}>
        {title}
      </Text>
    </Pressable>
  );
}
export function Badge() {
  return (
    <View style={s.badge}>
      <Text style={s.badgeText}>本機測試 · 無帳號 · 不發放正式獎勵</Text>
    </View>
  );
}
export function Page({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={s.content}>
        <Badge />
        <Text style={s.eyebrow}>{eyebrow}</Text>
        <Text accessibilityRole="header" style={s.title}>
          {title}
        </Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
export const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: {
    flexGrow: 1,
    padding: 24,
    gap: 16,
    maxWidth: 620,
    width: "100%",
    alignSelf: "center",
  },
  badge: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: "#E6ECDE",
    borderRadius: 12,
  },
  badgeText: {
    color: "#355443",
    fontSize: 11,
    textAlign: "center",
    fontWeight: "600",
  },
  eyebrow: {
    color: colors.muted,
    fontSize: 12,
    letterSpacing: 2,
    marginTop: 16,
  },
  title: { color: colors.ink, fontSize: 32, fontWeight: "700", lineHeight: 42 },
  body: { color: colors.muted, fontSize: 16, lineHeight: 27 },
  card: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 24,
    padding: 24,
    gap: 16,
  },
  button: {
    minHeight: 50,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: colors.green,
    justifyContent: "center",
    alignItems: "center",
  },
  secondary: {
    backgroundColor: colors.soft,
    borderWidth: 1,
    borderColor: colors.line,
  },
  buttonText: {
    color: "#FFFDF0",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  row: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  small: { color: colors.muted, fontSize: 12, lineHeight: 20 },
  feedback: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 26,
    padding: 18,
    backgroundColor: colors.soft,
    borderRadius: 16,
  },
});
