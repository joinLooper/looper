"use client";

import Image from "next/image";
import layerRegistry from "./authority/treehouse/treehouse_layer_registry.v1.json";
import hotspotMap from "./authority/treehouse/treehouse_hotspot_map.v1.json";
import { UNIFIED_RUNTIME_ASSETS } from "./asset-routes";
import type { DialogueCharacter } from "./runtime-types";

interface TreehouseLayer {
  layer_id: string;
  file_path: string;
  z_index: number;
  opacity: number;
  default_visibility: boolean;
  preload_behavior: string;
}

interface TreehouseHotspot {
  hotspot_id: string;
  enabled: boolean;
  polygons: number[][][];
}

const HOTSPOT_LABELS: Record<string, string> = {
  treehouse_exit: "返回森林",
  treehouse_storage_cabinet: "查看收納櫃",
  treehouse_star_shelf: "查看星星收藏架",
  treehouse_furniture_preview: "查看另一處收納空間",
  rabbit: "和兔兔說話",
  mole: "和土撥鼠說話",
};

function hotspotRect(hotspot: TreehouseHotspot) {
  const points = hotspot.polygons.flat();
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  return {
    left: `${(left / 390) * 100}%`,
    top: `${(top / 844) * 100}%`,
    width: `${((right - left) / 390) * 100}%`,
    height: `${((bottom - top) / 844) * 100}%`,
  };
}

export function TreehouseScene({
  onExit,
  onDialogue,
  onStorage,
  onStars,
}: {
  onExit: () => void;
  onDialogue: (character: DialogueCharacter) => void;
  onStorage: () => void;
  onStars: () => void;
}) {
  const layers = (layerRegistry.layers as TreehouseLayer[]).filter((layer) => layer.default_visibility);
  const actions: Record<string, () => void> = {
    treehouse_exit: onExit,
    treehouse_storage_cabinet: onStorage,
    treehouse_star_shelf: onStars,
    treehouse_furniture_preview: onStorage,
    rabbit: () => onDialogue("rabbit"),
    mole: () => onDialogue("marmot"),
  };

  return (
    <section className="treehouse-runtime" aria-labelledby="treehouse-title" data-runtime-contract="Treehouse_Runtime_Handoff_v001" data-runtime-layer-count="52">
      <h1 id="treehouse-title" className="sr-only" tabIndex={-1}>居民樹屋</h1>
      <div className="treehouse-runtime__canvas" data-logical-canvas="390x844">
        {layers.map((layer) => (
          <Image
            key={layer.layer_id}
            className="treehouse-runtime__layer"
            src={`/runtime-assets/unified-v001/treehouse/${layer.file_path.replace(/^assets\//, "")}`}
            alt=""
            fill
            sizes="(max-width: 780px) 100vw, 462px"
            unoptimized
            priority={layer.preload_behavior === "initial_critical"}
            aria-hidden
            style={{ zIndex: layer.z_index, opacity: layer.opacity }}
            data-layer-id={layer.layer_id}
          />
        ))}

        <Image className="treehouse-runtime__character treehouse-runtime__character--rabbit" src={UNIFIED_RUNTIME_ASSETS.characters.rabbitTreehouse} alt="兔兔坐在樹屋裡" width={250} height={250} unoptimized priority data-character-source="formal-v006" />
        <Image className="treehouse-runtime__character treehouse-runtime__character--marmot" src={UNIFIED_RUNTIME_ASSETS.characters.marmotTreehouse} alt="土撥鼠坐在樹屋裡" width={250} height={250} unoptimized priority data-character-source="formal-v006" data-character-alias="mole:marmot" />

        {(hotspotMap.hotspots as TreehouseHotspot[]).filter((hotspot) => hotspot.enabled).map((hotspot) => (
          <button
            key={hotspot.hotspot_id}
            type="button"
            className="treehouse-runtime__hotspot ui-control"
            style={hotspotRect(hotspot)}
            aria-label={HOTSPOT_LABELS[hotspot.hotspot_id]}
            onClick={actions[hotspot.hotspot_id]}
            data-hotspot-id={hotspot.hotspot_id}
          />
        ))}
      </div>
    </section>
  );
}
