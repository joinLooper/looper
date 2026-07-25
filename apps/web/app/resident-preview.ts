import type { UiAssetId } from "./ui-assets";

export const RESIDENT_PREVIEW_MODE =
  process.env.NEXT_PUBLIC_RESIDENT_PREVIEW_MODE === "true";

export type ResidentPreviewNoticeId =
  | "restaurant"
  | "weekly_missions"
  | "notifications"
  | "forest_tools"
  | "inventory"
  | "vouchers"
  | "support"
  | "text_size"
  | "accessibility_help";

export interface ResidentPreviewNotice {
  title: string;
  description: string;
  primaryAction: string;
  auxiliary: string;
  icon?: UiAssetId;
}

export const DEFAULT_COMING_SOON_NOTICE = {
  title: "這個區域還在準備中",
  description: "Looper 世界正在慢慢長大，這項功能之後會再開放。",
  primaryAction: "先回去看看",
} as const;

function comingSoon(
  auxiliary: string,
  icon?: UiAssetId,
): ResidentPreviewNotice {
  return {
    ...DEFAULT_COMING_SOON_NOTICE,
    auxiliary,
    icon,
  };
}

export const RESIDENT_PREVIEW_NOTICES: Readonly<
  Record<ResidentPreviewNoticeId, ResidentPreviewNotice>
> = {
  restaurant: {
    title: "蔬食餐廳區正在準備中",
    description:
      "城市生活機能尚未開放，之後你可以在這裡完成蔬食任務、累積減碳紀錄與居民獎勵。",
    primaryAction: "先回家看看",
    auxiliary: "第一位居民目前可以先探索自己的空間。",
    icon: "ui_icon_task_code",
  },
  weekly_missions: comingSoon(
    "本週成長任務之後會在這裡開放；現在可以先探索森林、樹屋與永續小知識。",
    "ui_icon_nav_mission",
  ),
  notifications: comingSoon(
    "重要消息與居民活動之後會集中在這裡；目前不會錯過任何必要步驟。",
    "ui_icon_notification",
  ),
  forest_tools: comingSoon(
    "澆水、整理與更多角色互動會陸續開放；現在可以先在森林與樹屋之間走走。",
    "ui_icon_forest_view",
  ),
  inventory: comingSoon(
    "之後取得的小物、回憶與生活收藏會放在這裡；目前不需要先準備物品。",
    "ui_icon_backpack",
  ),
  vouchers: comingSoon(
    "星星未來可用於居民兌換；功能開放前不會扣除任何資源。",
    "ui_icon_vouchers",
  ),
  support: comingSoon(
    "完整居民說明與聯絡方式會在服務開放前補齊。",
    "ui_icon_question",
  ),
  text_size: comingSoon(
    "目前文字大小會跟隨裝置系統設定，之後會提供遊戲內調整。",
    "ui_icon_info",
  ),
  accessibility_help: comingSoon(
    "目前可使用系統的 VoiceOver 或 TalkBack，完整操作說明之後會補上。",
    "ui_icon_question",
  ),
};

export function restaurantExperienceEnabled(
  previewMode = RESIDENT_PREVIEW_MODE,
): boolean {
  return !previewMode;
}

export function residentPreviewNotice(
  id: ResidentPreviewNoticeId,
): ResidentPreviewNotice {
  return RESIDENT_PREVIEW_NOTICES[id];
}
