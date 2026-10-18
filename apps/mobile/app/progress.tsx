import React from "react";
import Forest from "./forest";

/** Deep-link compatibility: progress is a Forest book view, not an app dashboard. */
export default function Progress() {
  return <Forest initialSheet="progress" />;
}
