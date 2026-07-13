import type { PlayerEventQueueItem, PlayerEventResolutionOutcome } from "@looper/types";

export type PlayerEventResolutionState = {
  eventId: string;
  outcome: PlayerEventResolutionOutcome;
  idempotencyKey: string;
};

export type PlayerEventCard = {
  visible: boolean;
  title: string;
  description?: string;
  primaryAction: string;
  secondaryAction: string;
  details: string[];
};

export function playerEventResolutionStorageKey(userId: string): string {
  return `looper.web.playerEventResolution.${userId}`;
}

export function loadResolutionState(storage: Pick<Storage, "getItem">, userId: string): PlayerEventResolutionState | null {
  try {
    const raw = storage.getItem(playerEventResolutionStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlayerEventResolutionState;
    if (!parsed.eventId || !parsed.idempotencyKey || (parsed.outcome !== "completed" && parsed.outcome !== "skipped")) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveResolutionState(storage: Pick<Storage, "setItem" | "removeItem">, userId: string, state: PlayerEventResolutionState | null): void {
  const key = playerEventResolutionStorageKey(userId);
  if (!state) {
    storage.removeItem(key);
    return;
  }
  storage.setItem(key, JSON.stringify(state));
}

export function reconcileResolutionState(current: PlayerEventResolutionState | null, nextEvent: PlayerEventQueueItem | null): PlayerEventResolutionState | null {
  if (!current || !nextEvent) return null;
  return current.eventId === nextEvent.id ? current : null;
}

export function getOrCreateResolutionState(current: PlayerEventResolutionState | null, eventId: string, outcome: PlayerEventResolutionOutcome, createId: () => string): PlayerEventResolutionState {
  if (current?.eventId === eventId && current.outcome === outcome) return current;
  return {
    eventId,
    outcome,
    idempotencyKey: `player-event:${createId()}`,
  };
}

function numericPayload(payload: Record<string, unknown>, key: string, fallback = 0): number {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringArrayPayload(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function playerEventCard(event: PlayerEventQueueItem | null): PlayerEventCard {
  if (!event) {
    return { visible: false, title: "", primaryAction: "", secondaryAction: "", details: [] };
  }

  if (event.eventType === "home_scene" && event.sceneId === "forest_clearing" && event.eventName === "first_meal_lv3_arrival") {
    return {
      visible: true,
      title: "森林落腳處已準備好了",
      description: "你的第一餐，讓這片森林有了新的變化。",
      primaryAction: "進入森林落腳處",
      secondaryAction: "略過演出",
      details: [],
    };
  }

  const level = numericPayload(event.payload, "level", event.eventLevel ?? 0);
  const chestStars = numericPayload(event.payload, "chestStars");
  const maxEnergy = numericPayload(event.payload, "maxEnergy");
  const levelBefore = numericPayload(event.payload, "levelBefore");
  const levelAfter = numericPayload(event.payload, "levelAfter", level);
  const unlockCount = stringArrayPayload(event.payload, "unlockFlags").length;

  return {
    visible: true,
    title: `升級到 Lv.${level}`,
    primaryAction: "繼續",
    secondaryAction: "略過",
    details: [
      `寶箱⭐ +${chestStars}`,
      `能量上限 ${maxEnergy}`,
      `解鎖新功能 × ${unlockCount}`,
      `Lv.${levelBefore} → Lv.${levelAfter}`,
    ],
  };
}

export function shouldRenderPlayerEventCard(event: PlayerEventQueueItem | null): boolean {
  return playerEventCard(event).visible;
}
