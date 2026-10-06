import sceneManifest from "./forest-runtime-contracts/forest_scene_manifest.v2.json";
import anchorMap from "./forest-runtime-contracts/forest_anchor_map.v2.json";
import hotspotMap from "./forest-runtime-contracts/forest_hotspot_map.v2.json";
import preloadMap from "./forest-runtime-contracts/forest_preload_map.v2.json";
import stateMap from "./forest-runtime-contracts/forest_state_map.v2.json";

export const FOREST_ASSET_ROOT = "/runtime-assets/forest-v002";
export const FOREST_CANVAS = { width: 390, height: 844 } as const;

export type ForestLayer = (typeof sceneManifest.layers)[number];
export interface ForestHotspot {
  hotspot_id: keyof typeof hotspotMap.hotspots;
  shape: string;
  x: number;
  y: number;
  width: number;
  height: number;
  accessibility_label: string;
}

export const FOREST_LAYERS = [...sceneManifest.layers].sort(
  (left, right) => left.z_index - right.z_index,
);
const HOTSPOT_LABELS: Record<keyof typeof hotspotMap.hotspots, string> = {
  hotspot_mission_board: "查看任務看板",
  hotspot_rabbit: "和兔兔說話",
  hotspot_mole: "和土撥鼠說話",
  hotspot_knowledge: "查看永續小知識",
  hotspot_core_tree: "查看森林成長",
  hotspot_treehouse: "進入樹屋",
  hotspot_restaurant: "蔬食餐廳區施工中",
  hotspot_settings: "開啟設定",
};

export const FOREST_HOTSPOTS = Object.entries(hotspotMap.hotspots).map(
  ([hotspotId, hotspot]) => ({
    hotspot_id: hotspotId as keyof typeof hotspotMap.hotspots,
    ...hotspot,
    accessibility_label:
      HOTSPOT_LABELS[hotspotId as keyof typeof hotspotMap.hotspots],
  }),
);
export const FOREST_PRELOAD = preloadMap.categories;
export const FOREST_STATE_MAP = stateMap;
export const FOREST_ANCHORS = anchorMap.anchors;
export const FOREST_CHARACTER_METADATA = anchorMap.character_runtime_metadata;

export function forestAssetPath(route: string): string {
  return `${FOREST_ASSET_ROOT}/${route}`;
}

export function logicalRectStyle({
  x,
  y,
  width,
  height,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return {
    left: `${(x / FOREST_CANVAS.width) * 100}%`,
    top: `${(y / FOREST_CANVAS.height) * 100}%`,
    width: `${(width / FOREST_CANVAS.width) * 100}%`,
    height: `${(height / FOREST_CANVAS.height) * 100}%`,
  };
}

let initialCriticalPromise:
  | Promise<{ loaded: number; failed: readonly string[] }>
  | undefined;

export function preloadForestInitialCriticalAssets(): Promise<{
  loaded: number;
  failed: readonly string[];
}> {
  if (typeof window === "undefined" || typeof window.Image === "undefined") {
    return Promise.resolve({ loaded: 0, failed: [] });
  }
  if (initialCriticalPromise) return initialCriticalPromise;

  const layerById = new Map(
    sceneManifest.layers.map((layer) => [layer.layer_id, layer] as const),
  );
  const routes = preloadMap.categories.initial_critical
    .map((layerId) => layerById.get(layerId)?.route)
    .filter((route): route is string => Boolean(route));

  initialCriticalPromise = Promise.all(
    routes.map(
      (route) =>
        new Promise<{ route: string; ok: boolean }>((resolve) => {
          const image = new window.Image();
          image.onload = () => resolve({ route, ok: true });
          image.onerror = () => resolve({ route, ok: false });
          image.src = forestAssetPath(route);
        }),
    ),
  ).then((results) => ({
    loaded: results.filter((result) => result.ok).length,
    failed: results
      .filter((result) => !result.ok)
      .map((result) => result.route),
  }));

  return initialCriticalPromise;
}
