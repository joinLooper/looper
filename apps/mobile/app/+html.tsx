import React, { type PropsWithChildren } from "react";
import { ScrollViewStyleReset } from "expo-router/html";

/** Native iOS/Android are unchanged; web-only mobile viewport authority.
 * Without a physical-width viewport meta tag, mobile Chrome can choose a
 * ~750px CSS layout viewport for a 360px emulated phone and crop RN modals.
 */
export default function RootHtml({ children }: PropsWithChildren) {
  return (
    <html lang="zh-Hant">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <ScrollViewStyleReset />
        <title>Looper｜森林生活</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
