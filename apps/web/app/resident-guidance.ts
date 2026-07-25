export type ResidentGuidanceMode = "first_run" | "replay";
export type ResidentGuidanceOutcome = "completed" | "skipped";

export interface ResidentGuidanceStep {
  id: "welcome" | "home" | "growth" | "today" | "city" | "explore";
  title: string;
  description: string;
  primaryAction: string;
  target?: "resident-space" | "forest-growth" | "today-tasks" | "restaurant-entry";
}

export interface ResidentGuidanceState {
  mode: ResidentGuidanceMode;
  stepIndex: number;
}

interface StoredResidentGuidance {
  version: 1;
  outcome: ResidentGuidanceOutcome;
}

export interface ResidentGuidanceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_PREFIX = "looper.web.residentGuidance.v1";

export const RESIDENT_GUIDANCE_STEPS: readonly ResidentGuidanceStep[] = [
  {
    id: "welcome",
    title: "歡迎來到 Looper",
    description:
      "這裡是你的居民空間。從現在開始，你在 Looper 裡累積的成長與行動，都會留在這個世界中。",
    primaryAction: "開始看看",
  },
  {
    id: "home",
    title: "這裡是你的家",
    description:
      "你可以在森林與樹屋之間移動，看看居民角色和已經放進空間裡的物件。",
    primaryAction: "下一步",
    target: "resident-space",
  },
  {
    id: "growth",
    title: "每次行動，都會留下成長",
    description:
      "未來完成蔬食行動後，減碳紀錄會累積成種子、盆栽與樹木，慢慢改變你的森林。",
    primaryAction: "下一步",
    target: "forest-growth",
  },
  {
    id: "today",
    title: "先從今天的小任務開始",
    description:
      "目前可以查看今日來訪與永續小知識。完成知識卡後，EXP 會依正式規則記錄。",
    primaryAction: "去看看",
    target: "today-tasks",
  },
  {
    id: "city",
    title: "城市生活機能正在準備",
    description:
      "之後你可以前往蔬食餐廳完成任務，累積減碳紀錄與居民獎勵。目前先留在自己的空間探索。",
    primaryAction: "知道了",
    target: "restaurant-entry",
  },
  {
    id: "explore",
    title: "開始你的居民生活",
    description:
      "森林、樹屋、角色與知識卡都可以先看看。尚未開放的區域會在之後慢慢加入。",
    primaryAction: "開始探索",
  },
] as const;

export function residentGuidanceStorageKey(residentId: string): string {
  const canonicalResidentId = residentId.trim();
  if (!canonicalResidentId) {
    throw new Error("A canonical resident ID is required.");
  }
  return `${STORAGE_PREFIX}.${encodeURIComponent(canonicalResidentId)}`;
}

export function hasCompletedResidentGuidance(
  storage: ResidentGuidanceStorage,
  residentId: string,
): boolean {
  try {
    const raw = storage.getItem(residentGuidanceStorageKey(residentId));
    if (!raw) return false;
    const stored = JSON.parse(raw) as Partial<StoredResidentGuidance>;
    return (
      stored.version === 1 &&
      (stored.outcome === "completed" || stored.outcome === "skipped")
    );
  } catch {
    return false;
  }
}

export function markResidentGuidanceFinished(
  storage: ResidentGuidanceStorage,
  residentId: string,
  outcome: ResidentGuidanceOutcome,
): void {
  const stored: StoredResidentGuidance = { version: 1, outcome };
  storage.setItem(
    residentGuidanceStorageKey(residentId),
    JSON.stringify(stored),
  );
}

export function shouldAutoStartResidentGuidance({
  previewMode,
  sessionState,
  connection,
  residentId,
  completed,
}: {
  previewMode: boolean;
  sessionState: string;
  connection: string;
  residentId: string | null | undefined;
  completed: boolean;
}): boolean {
  return (
    previewMode &&
    sessionState === "authenticated" &&
    connection === "connected" &&
    Boolean(residentId?.trim()) &&
    !completed
  );
}

export function residentWelcomeTitle(displayName: string | null | undefined): string {
  const safeName = displayName?.trim();
  return safeName ? `歡迎來到 Looper，${safeName}` : "歡迎來到 Looper";
}
