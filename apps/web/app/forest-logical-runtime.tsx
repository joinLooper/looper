"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FOREST_CANVAS,
  FOREST_ANCHORS,
  FOREST_CHARACTER_METADATA,
  FOREST_HOTSPOTS,
  FOREST_LAYERS,
  FOREST_PRELOAD,
  forestAssetPath,
  logicalRectStyle,
  type ForestHotspot,
  type ForestLayer,
} from "./forest-runtime";
import { RuntimeAssemblyRenderer } from "./runtime-assembly-renderer";

type ForestPanel = "rabbit" | "mole" | "core_tree" | "stars" | null;

export interface ForestLogicalRuntimeProps {
  playerState: {
    level: number;
    exp: number;
    nextLevelExp: number | null;
    isMaxLevel: boolean;
    stars: number;
    growth: {
      stageIcon: string;
      stageLabel: string;
      carbonTotalKg: number;
      carbonBalanceKg: number;
      seedCount: number;
      plantCount: number;
      treeCount: number;
    };
  } | null;
  missionUnread: boolean;
  knowledgeUnread: boolean;
  onOpenMissions: () => void;
  onOpenKnowledge: () => void;
  onOpenRestaurant: () => void;
  onOpenSettings: () => void;
}

const FULL_CANVAS_LAYER_IDS = new Set(
  FOREST_LAYERS.filter(
    (layer) =>
      layer.width === FOREST_CANVAS.width &&
      layer.height === FOREST_CANVAS.height,
  ).map((layer) => layer.layer_id),
);
const HUD_LAYER_IDS = new Set([
  "forest_hud_frame_left",
  "forest_hud_frame_right",
  "forest_settings_entry",
]);

const rabbitHotspot = FOREST_HOTSPOTS.find(
  (hotspot) => hotspot.hotspot_id === "hotspot_rabbit",
)!;
const moleHotspot = FOREST_HOTSPOTS.find(
  (hotspot) => hotspot.hotspot_id === "hotspot_mole",
)!;
const characterGuidanceRect = {
  x: Math.min(rabbitHotspot.x, moleHotspot.x),
  y: Math.min(rabbitHotspot.y, moleHotspot.y),
  width:
    Math.max(
      rabbitHotspot.x + rabbitHotspot.width,
      moleHotspot.x + moleHotspot.width,
    ) - Math.min(rabbitHotspot.x, moleHotspot.x),
  height:
    Math.max(
      rabbitHotspot.y + rabbitHotspot.height,
      moleHotspot.y + moleHotspot.height,
    ) - Math.min(rabbitHotspot.y, moleHotspot.y),
};

function shadowStyle(
  anchor: (typeof FOREST_ANCHORS)[keyof typeof FOREST_ANCHORS],
): CSSProperties {
  const width = anchor.width * 0.72;
  return {
    ...logicalRectStyle({
      x: anchor.x - width / 2,
      y: anchor.ground_baseline - 4,
      width,
      height: 8,
    }),
    zIndex: anchor.z_index - 1,
  };
}

function dialogueStyle(character: "rabbit" | "mole"): CSSProperties {
  const isRabbit = character === "rabbit";
  const anchor = isRabbit
    ? FOREST_ANCHORS.forest_rabbit_anchor
    : FOREST_ANCHORS.forest_mole_anchor;
  const [offsetX, offsetY] = isRabbit
    ? FOREST_CHARACTER_METADATA.forest_rabbit_anchor.dialogue_bubble_offset
    : FOREST_CHARACTER_METADATA.forest_mole_anchor.dialogue_bubble_offset;
  return {
    left: `${((anchor.x + offsetX) / FOREST_CANVAS.width) * 100}%`,
    top: `${((anchor.y + offsetY) / FOREST_CANVAS.height) * 100}%`,
  };
}

function layerStyle(layer: ForestLayer): CSSProperties {
  if (FULL_CANVAS_LAYER_IDS.has(layer.layer_id)) {
    return { inset: 0, width: "100%", height: "100%", zIndex: layer.z_index };
  }
  return {
    ...logicalRectStyle({
      x: layer.x,
      y: layer.y,
      width: layer.width * layer.scale,
      height: layer.height * layer.scale,
    }),
    zIndex: layer.z_index,
  };
}

function shouldRenderLayer(
  layer: ForestLayer,
  {
    deferredReady,
    missionUnread,
    knowledgeUnread,
    growthStarted,
  }: {
    deferredReady: boolean;
    missionUnread: boolean;
    knowledgeUnread: boolean;
    growthStarted: boolean;
  },
): boolean {
  if (
    FOREST_PRELOAD.deferred_after_entry.includes(
      layer.layer_id as (typeof FOREST_PRELOAD.deferred_after_entry)[number],
    ) &&
    !deferredReady
  ) {
    return false;
  }
  if (layer.layer_id === "forest_core_tree_indicator_idle") return growthStarted;
  if (layer.layer_id === "forest_core_tree_indicator_hint") return !growthStarted;
  if (layer.layer_id === "forest_mission_indicator_unread") return missionUnread;
  if (layer.layer_id === "forest_knowledge_indicator_unread")
    return knowledgeUnread;
  if (
    layer.layer_id === "forest_mission_indicator_claimable" ||
    layer.layer_id === "forest_knowledge_indicator_completed"
  ) {
    return false;
  }
  return true;
}

function guidanceTarget(hotspotId: string): string | undefined {
  if (hotspotId === "hotspot_core_tree") return "core_tree";
  if (hotspotId === "hotspot_mission_board") return "mission_board";
  if (hotspotId === "hotspot_restaurant") return "restaurant";
  return undefined;
}

function ForestHotspotButton({
  hotspot,
  onClick,
}: {
  hotspot: ForestHotspot;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="forest-logical-hotspot ui-control"
      style={{
        ...logicalRectStyle(hotspot),
        zIndex: 520,
      }}
      data-hotspot-id={hotspot.hotspot_id}
      data-guidance-target={guidanceTarget(hotspot.hotspot_id)}
      aria-label={hotspot.accessibility_label}
      onClick={onClick}
    />
  );
}

export function ForestLogicalRuntime({
  playerState,
  missionUnread,
  knowledgeUnread,
  onOpenMissions,
  onOpenKnowledge,
  onOpenRestaurant,
  onOpenSettings,
}: ForestLogicalRuntimeProps) {
  const loading = playerState === null;
  const level = playerState?.level ?? 0;
  const exp = playerState?.exp ?? 0;
  const nextLevelExp = playerState?.nextLevelExp ?? null;
  const isMaxLevel = playerState?.isMaxLevel ?? false;
  const stars = playerState?.stars ?? 0;
  const growth = playerState?.growth ?? {
    stageIcon: "",
    stageLabel: "",
    carbonTotalKg: 0,
    carbonBalanceKg: 0,
    seedCount: 0,
    plantCount: 0,
    treeCount: 0,
  };
  const [panel, setPanel] = useState<ForestPanel>(null);
  const [deferredReady, setDeferredReady] = useState(false);
  const [insideTreehouse, setInsideTreehouse] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelTriggerRef = useRef<HTMLElement | null>(null);
  const growthStarted =
    growth.carbonTotalKg > 0 ||
    growth.seedCount > 0 ||
    growth.plantCount > 0 ||
    growth.treeCount > 0;
  const expProgress = useMemo(() => {
    if (isMaxLevel || nextLevelExp === null || nextLevelExp <= 0) return 100;
    return Math.max(0, Math.min(100, (exp / nextLevelExp) * 100));
  }, [exp, isMaxLevel, nextLevelExp]);

  function openPanel(nextPanel: Exclude<ForestPanel, null>) {
    panelTriggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setPanel(nextPanel);
  }

  function closePanel() {
    setPanel(null);
    window.requestAnimationFrame(() => panelTriggerRef.current?.focus());
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setDeferredReady(true), 250);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!panel) return;
    closeButtonRef.current?.focus();
    const handlePanelKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel();
      if (event.key === "Tab") {
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handlePanelKeys);
    return () => window.removeEventListener("keydown", handlePanelKeys);
  }, [panel]);

  if (insideTreehouse) {
    return (
      <section className="forest-treehouse-route" aria-label="居民樹屋">
        <button
          type="button"
          className="forest-treehouse-route__back ui-control"
          onClick={() => setInsideTreehouse(false)}
        >
          返回森林
        </button>
        <RuntimeAssemblyRenderer
          residentPreview
          initialView="treehouse_main"
          sceneOnly="treehouse_main"
        />
      </section>
    );
  }

  const hotspotAction: Record<string, () => void> = {
    hotspot_mission_board: onOpenMissions,
    hotspot_rabbit: () => openPanel("rabbit"),
    hotspot_mole: () => openPanel("mole"),
    hotspot_knowledge: onOpenKnowledge,
    hotspot_core_tree: () => openPanel("core_tree"),
    hotspot_treehouse: () => setInsideTreehouse(true),
    hotspot_restaurant: onOpenRestaurant,
    hotspot_settings: onOpenSettings,
  };

  return (
    <section
      className="forest-logical-shell"
      aria-labelledby="forest-logical-title"
      data-runtime-contract="Forest_Runtime_Handoff_v002"
      data-runtime-density="logical_1x_uniform"
    >
      <h1 id="forest-logical-title" className="sr-only" tabIndex={-1}>
        我的森林
      </h1>
      <div
        className="forest-logical-canvas"
        data-guidance-target="forest_scene"
        data-logical-canvas="390x844"
      >
        {FOREST_LAYERS.map((layer) =>
          !HUD_LAYER_IDS.has(layer.layer_id) &&
          shouldRenderLayer(layer, {
            deferredReady,
            missionUnread,
            knowledgeUnread,
            growthStarted,
          }) ? (
            <img
              key={layer.layer_id}
              className={`forest-logical-layer forest-logical-layer--${layer.layer_id}`}
              style={layerStyle(layer)}
              src={forestAssetPath(layer.route)}
              alt=""
              aria-hidden="true"
              draggable={false}
              decoding="async"
              loading={
                FOREST_PRELOAD.initial_critical.includes(
                  layer.layer_id as (typeof FOREST_PRELOAD.initial_critical)[number],
                )
                  ? "eager"
                  : "lazy"
              }
              data-layer-id={layer.layer_id}
              data-transform={`${layer.x},${layer.y},${layer.scale}`}
              data-pivot={layer.pivot.join(",")}
              data-z-index={layer.z_index}
              data-pointer-events={layer.pointer_events}
            />
          ) : null,
        )}

        <span
          className="forest-character-shadow"
          style={shadowStyle(FOREST_ANCHORS.forest_rabbit_anchor)}
          data-shadow-slot="shadow_rabbit"
          aria-hidden="true"
        />
        <span
          className="forest-character-shadow"
          style={shadowStyle(FOREST_ANCHORS.forest_mole_anchor)}
          data-shadow-slot="shadow_mole"
          aria-hidden="true"
        />

        <div
          className="forest-character-guidance-target"
          style={{
            ...logicalRectStyle(characterGuidanceRect),
            zIndex: 510,
          }}
          data-guidance-target="character_area"
          aria-hidden="true"
        />

        {FOREST_HOTSPOTS.filter(
          (hotspot) => hotspot.hotspot_id !== "hotspot_settings",
        ).map((hotspot) => (
          <ForestHotspotButton
            hotspot={hotspot}
            key={hotspot.hotspot_id}
            onClick={hotspotAction[hotspot.hotspot_id]}
          />
        ))}

        {panel === "rabbit" || panel === "mole" ? (
          <section
            className={`forest-character-dialogue forest-character-dialogue--${panel}`}
            style={dialogueStyle(panel)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="forest-character-dialogue-title"
          >
            <button
              ref={closeButtonRef}
              type="button"
              className="forest-character-dialogue__close ui-control"
              aria-label="關閉對話"
              onClick={closePanel}
            >
              ×
            </button>
            <span>{panel === "rabbit" ? "兔兔居民夥伴" : "土撥鼠居民夥伴"}</span>
            <h2 id="forest-character-dialogue-title">
              {panel === "rabbit"
                ? "歡迎回來，一起看看森林吧。"
                : "森林裡的成長都會留下來。"}
            </h2>
            <p>
              {panel === "rabbit"
                ? "任務看板與永續小知識都已經準備好。"
                : "正式行動完成後，中央紀錄會同步更新成長摘要。"}
            </p>
          </section>
        ) : null}
      </div>

      <div className="forest-hud-viewport" aria-label="森林 HUD">
        {FOREST_LAYERS.filter((layer) =>
          HUD_LAYER_IDS.has(layer.layer_id),
        ).map((layer) => (
          <img
            key={layer.layer_id}
            className={`forest-hud-layer ${
              layer.layer_id === "forest_hud_frame_left"
                ? "forest-hud-layer--left"
                : "forest-hud-layer--right"
            }`}
            src={forestAssetPath(layer.route)}
            alt=""
            aria-hidden="true"
            draggable={false}
            decoding="async"
            data-layer-id={layer.layer_id}
            data-transform={`${layer.x},${layer.y},${layer.scale}`}
            data-pivot={layer.pivot.join(",")}
            data-z-index={layer.z_index}
          />
        ))}
        <div className="forest-hud-live forest-hud-live--progress" aria-label={loading ? "正在同步等級與經驗值" : `等級 ${level}，經驗值 ${exp}${nextLevelExp === null ? "" : ` / ${nextLevelExp}`}`}>
          {loading ? (
            <span className="forest-hud-skeleton forest-hud-skeleton--progress" role="status">
              <span className="sr-only">正在同步等級與經驗值</span>
            </span>
          ) : (
            <>
              <strong>Lv.{level}</strong>
              <span className="forest-hud-live__meter" aria-hidden="true">
                <span style={{ width: `${expProgress}%` }} />
              </span>
              <small>{isMaxLevel ? "MAX" : `${exp}/${nextLevelExp ?? "—"}`}</small>
            </>
          )}
        </div>
        <button
          type="button"
          className="forest-hud-live forest-hud-live--stars ui-control"
          aria-label={loading ? "正在同步星星" : `查看星星摘要，目前 ${stars} 顆`}
          disabled={loading}
          onClick={() => openPanel("stars")}
        >
          {loading ? (
            <span className="forest-hud-skeleton forest-hud-skeleton--stars" role="status">
              <span className="sr-only">正在同步星星</span>
            </span>
          ) : (
            <>
              <span aria-hidden="true">★</span>
              <strong>{stars}</strong>
            </>
          )}
        </button>
        <button
          type="button"
          className="forest-hud-settings-hotspot ui-control"
          data-hotspot-id="hotspot_settings"
          aria-label="開啟設定"
          onClick={onOpenSettings}
        />
      </div>

      {panel === "core_tree" || panel === "stars" ? (
        <div className="forest-logical-panel-backdrop" role="presentation">
          <section
            className="forest-logical-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="forest-panel-title"
          >
            <button
              ref={closeButtonRef}
              type="button"
              className="forest-logical-panel__close ui-control"
              aria-label="關閉"
              onClick={closePanel}
            >
              ×
            </button>
            {panel === "stars" ? (
              <>
                <span className="forest-logical-panel__eyebrow">居民星星</span>
                <h2 id="forest-panel-title">目前持有 {stars} 顆星星</h2>
                <p>星星來自中央玩家資料；本畫面只顯示摘要，不會扣除或建立任何資源。</p>
              </>
            ) : loading ? (
              <>
                <span className="forest-logical-panel__eyebrow">森林成長摘要</span>
                <h2 id="forest-panel-title">正在同步森林成長</h2>
                <p>中央玩家資料完成連線後，這裡會顯示你的正式成長紀錄。</p>
              </>
            ) : (
              <>
                <span className="forest-logical-panel__eyebrow">森林成長摘要</span>
                <h2 id="forest-panel-title">
                  {growth.stageIcon} {growth.stageLabel}
                </h2>
                <p>
                  已累積 {growth.carbonTotalKg.toFixed(1)} kg CO₂e，尚未轉換{" "}
                  {growth.carbonBalanceKg.toFixed(1)} kg。
                </p>
                <div className="forest-logical-panel__counts" aria-label="種子植物與樹木數量">
                  <span>🌱 <strong>{growth.seedCount}</strong></span>
                  <span>🪴 <strong>{growth.plantCount}</strong></span>
                  <span>🌳 <strong>{growth.treeCount}</strong></span>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}
