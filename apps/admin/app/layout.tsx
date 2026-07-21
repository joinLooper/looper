import type { ReactNode } from "react";
import AdminSessionGate from "./admin-session-gate";
import "./globals.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="zh-Hant"><body><AdminSessionGate>{children}</AdminSessionGate></body></html>;
}
