export const RESIDENT_PREVIEW_MODE =
  process.env.NEXT_PUBLIC_RESIDENT_PREVIEW_MODE === "true";

export type ResidentPreviewNoticeId =
  | "restaurant"
  | "weekly_missions"
  | "notifications"
  | "forest_tools"
  | "inventory"
  | "vouchers"
  | "support";

export interface ResidentPreviewNotice {
  title: string;
  description: string;
  primaryAction: string;
  auxiliary: string;
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
  },
  weekly_missions: {
    title: "本週任務正在準備中",
    description: "更多居民生活任務會在城市機能準備完成後陸續出現。",
    primaryAction: "回到居民空間",
    auxiliary: "現在可以先探索森林、樹屋與永續小知識。",
  },
  notifications: {
    title: "居民通知正在準備中",
    description: "之後的重要消息與居民活動會集中顯示在這裡。",
    primaryAction: "回到居民空間",
    auxiliary: "目前不會錯過任何必要步驟。",
  },
  forest_tools: {
    title: "更多森林互動正在準備中",
    description: "澆水、整理與陪伴角色的互動會在準備完成後陸續開放。",
    primaryAction: "回到森林",
    auxiliary: "現在可以先在森林與樹屋之間走走。",
  },
  inventory: {
    title: "居民物品庫正在準備中",
    description: "之後取得的物品、回憶與生活收藏會放在這裡。",
    primaryAction: "回到森林",
    auxiliary: "目前不需要先準備任何物品。",
  },
  vouchers: {
    title: "星星兌換正在準備中",
    description: "居民兌換與持有紀錄會在城市生活機能開放後提供。",
    primaryAction: "回到居民空間",
    auxiliary: "你的星星會繼續安全保留。",
  },
  support: {
    title: "居民說明正在準備中",
    description: "完整說明與聯絡方式會在居民服務開放前補齊。",
    primaryAction: "回到居民空間",
    auxiliary: "目前可以從設定頁返回自己的空間。",
  },
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
