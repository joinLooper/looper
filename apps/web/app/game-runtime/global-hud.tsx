"use client";

import Image from "next/image";
import { useState } from "react";
import type { UserProgress } from "@looper/types";
import { UNIFIED_RUNTIME_ASSETS } from "./asset-routes";

export function GlobalHud({
  profile,
  reducedMotion,
  onOpenStars,
  onOpenSettings,
}: {
  profile: UserProgress;
  reducedMotion: boolean;
  onOpenStars: () => void;
  onOpenSettings: () => void;
}) {
  const { resources } = profile;
  const threshold = resources.nextLevelExp;
  const previousThreshold = resources.currentLevel === 1 ? 0 : resources.currentLevel === 2 ? 50 : 150;
  const range = threshold === null ? 1 : Math.max(1, threshold - previousThreshold);
  const progress = threshold === null
    ? 100
    : Math.max(0, Math.min(100, ((resources.currentExp - previousThreshold) / range) * 100));
  const energyFull = resources.maxEnergy > 0 && resources.currentEnergy >= resources.maxEnergy;
  const [settingsState, setSettingsState] = useState<"idle" | "focus" | "pressed">("idle");
  const settingsVisualState = reducedMotion ? "reduced_motion" : settingsState;
  const settingsAsset = settingsVisualState === "reduced_motion"
    ? UNIFIED_RUNTIME_ASSETS.hud.settingsReducedMotion
    : settingsVisualState === "pressed"
      ? UNIFIED_RUNTIME_ASSETS.hud.settingsPressed
      : settingsVisualState === "focus"
        ? UNIFIED_RUNTIME_ASSETS.hud.settingsFocus
        : UNIFIED_RUNTIME_ASSETS.hud.settingsIdle;

  return (
    <header
      className="global-game-hud"
      aria-label="居民資源"
      data-global-hud-family="resource-runtime-v001"
      data-global-hud-family-count="1"
    >
      <div className="global-game-hud__level" aria-label={`等級 ${resources.currentLevel}，累積經驗 ${resources.currentExp}`}>
        <Image src={UNIFIED_RUNTIME_ASSETS.hud.levelBase} alt="" fill sizes="180px" unoptimized aria-hidden />
        <strong>Lv.{resources.currentLevel}</strong>
        <span className="global-game-hud__exp-track" aria-hidden>
          <span style={{ width: `${progress}%` }} />
        </span>
        <small>{threshold === null ? "MAX" : `${resources.currentExp}/${threshold}`}</small>
      </div>

      <div className="global-game-hud__right">
        <button
          type="button"
          className="global-game-hud__stars ui-control"
          onClick={onOpenStars}
          aria-label={`查看星星摘要，目前 ${resources.starBalance} 顆`}
          data-focus-trigger="stars_summary"
        >
          <Image src={UNIFIED_RUNTIME_ASSETS.hud.starsFrame} alt="" fill sizes="112px" unoptimized aria-hidden />
          <Image src={UNIFIED_RUNTIME_ASSETS.hud.starsIcon} alt="" width={30} height={30} unoptimized aria-hidden />
          <strong>{resources.starBalance}</strong>
        </button>
        <button
          type="button"
          className="global-game-hud__settings ui-control"
          onClick={onOpenSettings}
          onFocus={() => setSettingsState("focus")}
          onBlur={() => setSettingsState("idle")}
          onPointerDown={() => setSettingsState("pressed")}
          onPointerUp={() => setSettingsState("focus")}
          onPointerCancel={() => setSettingsState("focus")}
          aria-label="開啟設定"
          data-focus-trigger="settings"
          data-settings-hud-state={settingsVisualState}
          data-settings-hud-assets="idle,focus,pressed,reduced_motion"
        >
          <Image src={settingsAsset} alt="" fill sizes="45px" unoptimized aria-hidden data-settings-hud-asset={settingsVisualState} />
        </button>
      </div>

      {resources.currentLevel >= 3 ? (
        <div
          className="global-game-hud__energy"
          aria-label={energyFull ? `能量已滿，${resources.currentEnergy} / ${resources.maxEnergy}` : `能量 ${resources.currentEnergy} / ${resources.maxEnergy}`}
          data-energy-full={energyFull}
          data-energy-asset-route="present"
        >
          <Image
            src={energyFull ? UNIFIED_RUNTIME_ASSETS.hud.energyFull : UNIFIED_RUNTIME_ASSETS.hud.energyIdle}
            alt=""
            fill
            sizes="148px"
            unoptimized
            aria-hidden
          />
          <Image src={UNIFIED_RUNTIME_ASSETS.hud.energySymbol} alt="" width={24} height={24} unoptimized aria-hidden />
          <strong>{energyFull ? "FULL" : `${resources.currentEnergy}/${resources.maxEnergy}`}</strong>
        </div>
      ) : null}
    </header>
  );
}
