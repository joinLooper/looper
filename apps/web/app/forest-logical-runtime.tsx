"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import {
  FOREST_CANVAS,
  FOREST_ANCHORS,
  FOREST_HOTSPOTS,
  FOREST_LAYERS,
  FOREST_PRELOAD,
  forestAssetPath,
  logicalRectStyle,
  type ForestHotspot,
  type ForestLayer,
} from "./forest-runtime";

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
  entryGuidanceActive: boolean;
  onOpenMissions: () => void;
  onOpenKnowledge: () => void;
  onOpenRestaurant: () => void;
  onOpenSettings: () => void;
  onOpenDialogue: (character: "rabbit" | "marmot") => void;
  onOpenCoreTree: () => void;
  onOpenStars: () => void;
  onEnterTreehouse: () => void;
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
const FIRST_ENTRY_GUIDANCE_HOTSPOTS = new Set([
  "hotspot_mission_board",
  "hotspot_treehouse",
  "hotspot_core_tree",
  "hotspot_rabbit",
]);

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
  if (layer.layer_id === "forest_rabbit_proxy" || layer.layer_id === "forest_mole_proxy") {
    return false;
  }
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
  if (hotspotId === "hotspot_treehouse") return "treehouse";
  if (hotspotId === "hotspot_rabbit") return "rabbit";
  if (hotspotId === "hotspot_restaurant") return "restaurant";
  return undefined;
}

function ForestHotspotButton({
  hotspot,
  guided,
  onClick,
}: {
  hotspot: ForestHotspot;
  guided: boolean;
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
      data-first-entry-guidance={guided ? "active" : undefined}
      aria-label={hotspot.accessibility_label}
      onClick={onClick}
    />
  );
}

export function ForestLogicalRuntime({
  playerState,
  missionUnread,
  knowledgeUnread,
  entryGuidanceActive,
  onOpenMissions,
  onOpenKnowledge,
  onOpenRestaurant,
  onOpenSettings,
  onOpenDialogue,
  onOpenCoreTree,
  onOpenStars,
  onEnterTreehouse,
}: ForestLogicalRuntimeProps) {
  const growth = playerState?.growth ?? {
    stageIcon: "",
    stageLabel: "",
    carbonTotalKg: 0,
    carbonBalanceKg: 0,
    seedCount: 0,
    plantCount: 0,
    treeCount: 0,
  };
  const [deferredReady, setDeferredReady] = useState(false);
  const growthStarted =
    growth.carbonTotalKg > 0 ||
    growth.seedCount > 0 ||
    growth.plantCount > 0 ||
    growth.treeCount > 0;
  useEffect(() => {
    const deferredTimer = window.setTimeout(() => setDeferredReady(true), 250);
    return () => window.clearTimeout(deferredTimer);
  }, []);

  const hotspotAction: Record<string, () => void> = {
    hotspot_mission_board: onOpenMissions,
    hotspot_rabbit: () => onOpenDialogue("rabbit"),
    hotspot_mole: () => onOpenDialogue("marmot"),
    hotspot_knowledge: onOpenKnowledge,
    hotspot_core_tree: onOpenCoreTree,
    hotspot_treehouse: onEnterTreehouse,
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
            <Image
              key={layer.layer_id}
              className={`forest-logical-layer forest-logical-layer--${layer.layer_id}`}
              style={layerStyle(layer)}
              src={forestAssetPath(layer.route)}
              alt=""
              width={layer.width}
              height={layer.height}
              unoptimized
              aria-hidden
              draggable={false}
              priority={FOREST_PRELOAD.initial_critical.includes(layer.layer_id as (typeof FOREST_PRELOAD.initial_critical)[number])}
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

        <Image
          className="forest-formal-character forest-formal-character--rabbit"
          src="/runtime-assets/v006/seated/masters/char_rabbit_act_sit_right_3q_v006_master.png"
          alt="兔兔"
          width={254}
          height={254}
          unoptimized
          priority
          data-character-source="formal-v006"
        />
        <Image
          className="forest-formal-character forest-formal-character--marmot"
          src="/runtime-assets/v006/seated/masters/char_marmot_act_sit_left_3q_v006_master.png"
          alt="土撥鼠"
          width={254}
          height={254}
          unoptimized
          priority
          data-character-source="formal-v006"
          data-character-alias="mole:marmot"
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

        {FOREST_HOTSPOTS.map((hotspot) => (
          <ForestHotspotButton
            hotspot={hotspot}
            guided={entryGuidanceActive && FIRST_ENTRY_GUIDANCE_HOTSPOTS.has(hotspot.hotspot_id)}
            key={hotspot.hotspot_id}
            onClick={hotspotAction[hotspot.hotspot_id]}
          />
        ))}

      </div>
    </section>
  );
}
