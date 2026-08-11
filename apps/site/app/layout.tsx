import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Footer } from "../components/footer";
import { Header } from "../components/header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Looper｜把蔬食行動帶回會成長的世界",
  description:
    "Looper 把真實生活中的蔬食任務帶回森林、樹屋、核心樹與居民生活。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const playerEntryUrl = process.env.PUBLIC_PLAYER_ENTRY_URL;
  const lineOaUrl = process.env.PUBLIC_LINE_OA_URL;

  return (
    <html lang="zh-Hant">
      <body>
        <a className="skip-link" href="#main-content">
          跳至主要內容
        </a>
        <Header playerEntryUrl={playerEntryUrl} />
        {children}
        <Footer lineOaUrl={lineOaUrl} />
      </body>
    </html>
  );
}
