import React from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DemoProvider, useDemo } from "../src/state";
function Navigation() {
  const { reduced } = useDemo();
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: reduced ? "none" : "fade",
          contentStyle: { backgroundColor: "#F5F4EB" },
        }}
      />
    </>
  );
}
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <DemoProvider>
        <Navigation />
      </DemoProvider>
    </SafeAreaProvider>
  );
}
