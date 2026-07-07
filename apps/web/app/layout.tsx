import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./mobile.css";
import "./feedback.css";

export const metadata: Metadata = {
  title: "Looper Forest",
  description: "讓每一個小行動，都在森林裡留下改變。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
