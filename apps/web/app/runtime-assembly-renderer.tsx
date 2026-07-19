"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import handoff from "./looper-runtime-assembly-handoff.v005.json";

const ASSET_ROOT = "/runtime-assets/v005";

const layerOrder = handoff.layer_order_back_to_front;

type SceneId = keyof typeof handoff.scenes;
type PreviewId =
  | "t6_watering"
  | "t6_broom"
  | "t6_snack_tray"
  | "d9_rabbit_scarf"
  | "d9_mole_scarf";
type RendererView = SceneId | PreviewId;

const views: ReadonlyArray<{
  id: RendererView;
  label: string;
  gate: "scene_container" | "static_preview_only";
}> = [
  { id: "forest_clearing", label: "森林", gate: "scene_container" },
  { id: "treehouse_main", label: "樹屋", gate: "scene_container" },
  { id: "t6_watering", label: "澆水壺", gate: "static_preview_only" },
  { id: "t6_broom", label: "掃把", gate: "static_preview_only" },
  { id: "t6_snack_tray", label: "點心托盤", gate: "static_preview_only" },
  { id: "d9_rabbit_scarf", label: "兔兔圍巾", gate: "static_preview_only" },
  { id: "d9_mole_scarf", label: "土撥鼠圍巾", gate: "static_preview_only" },
];

const previewAssets: Record<PreviewId, string> = {
  t6_watering: `${ASSET_ROOT}/previews/t6_watering_static_preview_only.png`,
  t6_broom: `${ASSET_ROOT}/previews/t6_broom_static_preview_only.png`,
  t6_snack_tray: `${ASSET_ROOT}/previews/t6_snack_tray_static_preview_only.png`,
  d9_rabbit_scarf: `${ASSET_ROOT}/previews/d9_rabbit_scarf_static_preview_only.png`,
  d9_mole_scarf: `${ASSET_ROOT}/previews/d9_mole_scarf_static_preview_only.png`,
};

function rectStyle(rect: readonly number[]): CSSProperties {
  const [x, y, width, height] = rect;
  return {
    left: `${(x / handoff.canvas.width) * 100}%`,
    top: `${(y / handoff.canvas.height) * 100}%`,
    width: `${(width / handoff.canvas.width) * 100}%`,
    height: `${(height / handoff.canvas.height) * 100}%`,
  };
}

function SceneCanvas({
  sceneId,
  showGuides,
}: {
  sceneId: SceneId;
  showGuides: boolean;
}) {
  const scene = handoff.scenes[sceneId];
  const isForest = sceneId === "forest_clearing";

  return (
    <div
      className="runtime-scene-canvas"
      data-scene-id={sceneId}
      data-canvas="1000x1000"
      data-ground-y={handoff.canvas.ground_y}
      aria-label={
        isForest ? "森林空地場景組裝預覽" : "樹屋共用空間場景組裝預覽"
      }
    >
      {layerOrder.map((layerName, layerIndex) => (
        <div
          className={`runtime-layer runtime-layer--${layerName}`}
          data-z-layer={layerName}
          data-z-index={layerIndex + 1}
          key={layerName}
          style={{ zIndex: layerIndex + 1 }}
        >
          {layerName === "scene_background" ? (
            <img
              className="runtime-scene-background"
              src={`${ASSET_ROOT}/scenes/scene_${sceneId}_base_v001_1000.png`}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          ) : null}

          {layerName === "floor_back" && isForest ? (
            <img
              className="runtime-slot-art"
              data-slot-id="forest_rest_seat"
              data-runtime-gate="HOLD_WAITING_FOR_SEATED_POSE"
              style={rectStyle(
                handoff.scenes.forest_clearing.slots.forest_rest_seat,
              )}
              src={`${ASSET_ROOT}/exports/furn_leaf_cushion_v001_runtime.png`}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          ) : null}

          {layerName === "floor_back" && !isForest ? (
            <img
              className="runtime-slot-art"
              data-slot-id="second_seat"
              data-runtime-gate="HOLD_WAITING_FOR_SEATED_POSE"
              style={rectStyle(handoff.scenes.treehouse_main.slots.second_seat)}
              src={`${ASSET_ROOT}/exports/furn_second_cushion_v001_runtime.png`}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          ) : null}

          {layerName === "prop_back" && isForest ? (
            <img
              className="runtime-slot-art"
              data-slot-id="forest_watering_tool"
              data-action-energy-cost="null"
              style={rectStyle(
                handoff.scenes.forest_clearing.slots.forest_watering_tool,
              )}
              src={`${ASSET_ROOT}/exports/tool_watering_can_v001_runtime.png`}
              alt=""
              aria-hidden="true"
              draggable={false}
            />
          ) : null}

          {layerName === "actor_torso_head" ? (
            <img
              className="runtime-actor"
              data-anchor="character_feet"
              style={rectStyle(scene.actor_zone)}
              src={
                isForest
                  ? `${ASSET_ROOT}/exports/char_rabbit_left_3q_runtime.png`
                  : `${ASSET_ROOT}/exports/char_mole_right_3q_runtime.png`
              }
              alt={isForest ? "站立的兔兔" : "站立的土撥鼠"}
              draggable={false}
            />
          ) : null}
        </div>
      ))}

      {showGuides ? (
        <div className="runtime-guides" aria-hidden="true">
          <span
            className="runtime-safe-rect"
            style={rectStyle(handoff.canvas.safe_rect)}
          />
          <span
            className="runtime-ground-line"
            style={{
              top: `${(handoff.canvas.ground_y / handoff.canvas.height) * 100}%`,
            }}
          />
          <span className="runtime-guide-label runtime-guide-label--safe">
            安全區
          </span>
          <span className="runtime-guide-label runtime-guide-label--ground">
            ground y={handoff.canvas.ground_y} / character_feet
          </span>
        </div>
      ) : null}
    </div>
  );
}

function StaticPreview({ previewId }: { previewId: PreviewId }) {
  const label = views.find((view) => view.id === previewId)?.label ?? previewId;
  return (
    <div
      className="runtime-static-preview"
      data-preview-id={previewId}
      data-runtime-gate="static_preview_only"
      data-runtime-mask="pending"
      aria-label={`${label}靜態遮擋核准預覽`}
    >
      <img
        src={previewAssets[previewId]}
        alt={`${label}靜態核准畫面`}
        draggable={false}
      />
      <div className="runtime-preview-badge">
        <strong>{label}</strong>
        <span>Static approved / Runtime mask pending</span>
      </div>
    </div>
  );
}

export function RuntimeAssemblyRenderer() {
  const [view, setView] = useState<RendererView>("forest_clearing");
  const [showGuides, setShowGuides] = useState(false);
  const selected = views.find((item) => item.id === view) ?? views[0];
  const isScene = selected.gate === "scene_container";

  return (
    <section
      className="runtime-assembly"
      aria-labelledby="runtime-assembly-title"
      data-contract="looper.runtime-assembly-handoff.v5"
      data-central-sync="false"
      data-energy-enabled="false"
      data-action-energy-cost="null"
    >
      <div className="runtime-assembly__heading">
        <div>
          <span>v005 第一輪 renderer</span>
          <h2 id="runtime-assembly-title">森林與樹屋組裝驗證</h2>
        </div>
        <button
          type="button"
          className="runtime-guide-toggle ui-control"
          aria-pressed={showGuides}
          onClick={() => setShowGuides((current) => !current)}
        >
          {showGuides ? "隱藏接線" : "顯示接線"}
        </button>
      </div>

      <div
        className="runtime-view-tabs"
        role="tablist"
        aria-label="場景組裝狀態"
      >
        {views.map((item) => (
          <button
            type="button"
            role="tab"
            aria-selected={view === item.id}
            className="runtime-view-tab ui-control"
            key={item.id}
            onClick={() => setView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="runtime-view-panel">
        {isScene ? (
          <SceneCanvas sceneId={view as SceneId} showGuides={showGuides} />
        ) : (
          <StaticPreview previewId={view as PreviewId} />
        )}
      </div>

      <p className="runtime-gate-note" role="status">
        {isScene
          ? "F2 / T5 已接入 character_feet; 兩個座墊維持坐姿素材待補。"
          : "此畫面只重現 v004 核准的靜態遮擋; 手掌與下巴毛髮 runtime mask 尚未完成。"}
      </p>

      <details className="runtime-layer-dump">
        <summary>z-layer dump</summary>
        <ol>
          {layerOrder.map((layerName, index) => (
            <li key={layerName} data-z-layer={layerName}>
              <code>{index + 1}</code> {layerName}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
