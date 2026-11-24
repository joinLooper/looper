"use client";

import Image from "next/image";
import { UNIFIED_RUNTIME_ASSETS } from "./asset-routes";

export type U03NavKey = "forest" | "mission" | "exchange" | "settings";

const U03_NAV_ITEMS = [
  { key: "forest", label: "森林" },
  { key: "mission", label: "任務" },
  { key: "exchange", label: "兌換" },
  { key: "settings", label: "設定" },
] as const;

export function U03BottomNav({
  active, missionReady, onForest, onMission, onExchange, onSettings,
}: {
  active: U03NavKey;
  missionReady: boolean;
  onForest: () => void;
  onMission: () => void;
  onExchange: () => void;
  onSettings: () => void;
}) {
  const actions: Record<U03NavKey, () => void> = {
    forest: onForest,
    mission: onMission,
    exchange: onExchange,
    settings: onSettings,
  };
  return (
    <nav className="u03-bottom-nav" aria-label="主要導覽" data-u03-nav-authority="FOUNDER_APPROVED_20261124">
      {U03_NAV_ITEMS.map((item) => {
        const selected = active === item.key;
        const unavailable = item.key === "mission" && !missionReady;
        return (
          <button
            key={item.key}
            type="button"
            className={"u03-bottom-nav__item ui-control" + (selected ? " u03-bottom-nav__item--selected" : "")}
            onClick={actions[item.key]}
            disabled={unavailable}
            aria-current={selected ? "page" : undefined}
            aria-label={item.key === "exchange" ? "兌換：正式券庫待接線" : item.label}
            data-u03-nav-key={item.key}
            data-u03-nav-asset-id={"ui_icon_nav_" + item.key}
            data-u03-nav-state={unavailable ? "disabled" : selected ? "selected" : "default"}
          >
            <Image
              className="u03-bottom-nav__source-surface"
              src={selected ? UNIFIED_RUNTIME_ASSETS.navigation.itemSelected : UNIFIED_RUNTIME_ASSETS.navigation.itemBase}
              alt=""
              fill
              sizes="(max-width: 480px) 22vw, 96px"
              unoptimized
              aria-hidden
            />
            <Image src={UNIFIED_RUNTIME_ASSETS.navigation[item.key]} alt="" width={26} height={26} unoptimized aria-hidden />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
