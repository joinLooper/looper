"use client";

import type { Mission, UserProgress } from "@looper/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AssetButton,
  AssetSurface,
  FocusAsset,
  ProgressMeter,
  ResourceChip,
  UiIcon,
} from "./ui-primitives";
import { type UiAssetId, uiAssetPath } from "./ui-assets";
import { RuntimeAssemblyRenderer } from "./runtime-assembly-renderer";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Screen = "home" | "missions" | "exchange" | "forest" | "settings";
type ConnectionState = "loading" | "connected" | "offline";
type TaskVisualState =
  | "loading"
  | "available"
  | "in_progress"
  | "completed"
  | "claimed"
  | "unavailable"
  | "expired";

interface PlayerViewModel {
  id: string;
  displayName: string;
  level: number;
  exp: number;
  nextLevelExp: number;
  stars: number;
  carbonKg: number;
  carbonTargetKg: number;
  weeklyDays: number;
}

const previewPlayer: PlayerViewModel = {
  id: "user-demo",
  displayName: "森林旅人",
  level: 5,
  exp: 810,
  nextLevelExp: 1010,
  stars: 600,
  carbonKg: 0.8,
  carbonTargetKg: 2,
  weeklyDays: 4,
};

const dailyTasks = [
  {
    id: "daily-login",
    title: "每日簽到",
    description: "回到森林，看看今天的新變化。",
    reward: "+20 EXP",
    icon: "ui_icon_check" as UiAssetId,
    state: "claimed" as TaskVisualState,
  },
  {
    id: "daily-knowledge",
    title: "永續小知識💡",
    description: "讀一張小卡，補充今天的永續靈感。",
    reward: "+100 星星・+50 EXP",
    icon: "ui_icon_knowledge" as UiAssetId,
    state: "available" as TaskVisualState,
  },
  {
    id: "vegetarian-meal",
    title: "完成一餐蔬食",
    description: "到合作分店完成餐點後，輸入店家提供的 4 碼。",
    reward: "+200 EXP・+0.8 kg CO₂e",
    icon: "ui_icon_task_code" as UiAssetId,
    state: "in_progress" as TaskVisualState,
  },
];

const inventoryItems = [
  {
    id: "sprout-pot",
    name: "花盆小芽",
    detail: "永久小物",
    state: "placed",
    icon: "ui_icon_equip" as UiAssetId,
  },
  {
    id: "leaf-coaster",
    name: "葉片杯墊",
    detail: "已持有",
    state: "owned",
    icon: "ui_icon_backpack" as UiAssetId,
  },
  {
    id: "pinecone-door",
    name: "松果門飾",
    detail: "已裝備",
    state: "equipped",
    icon: "ui_icon_treehouse" as UiAssetId,
  },
] as const;

const forestActions = [
  { label: "澆水", state: "靜態預覽", icon: "ui_icon_water" as UiAssetId },
  { label: "整理樹屋", state: "靜態預覽", icon: "ui_icon_tidy" as UiAssetId },
  { label: "準備點心", state: "靜態預覽", icon: "ui_icon_snack" as UiAssetId },
] as const;

function IconButton({
  icon,
  label,
  onClick,
  selected = false,
}: {
  icon: UiAssetId;
  label: string;
  onClick?: () => void;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      className="asset-icon-button ui-control"
      aria-label={label}
      aria-pressed={selected || undefined}
      onClick={onClick}
    >
      <img
        className="asset-icon-button__art"
        src={uiAssetPath("ui_icon_button", selected ? "selected" : "default")}
        alt=""
        aria-hidden="true"
      />
      <UiIcon assetId={icon} />
      <FocusAsset />
    </button>
  );
}

function TaskCard({
  task,
  onAction,
}: {
  task: (typeof dailyTasks)[number];
  onAction: () => void;
}) {
  const actionLabel =
    task.state === "claimed"
      ? "已領取"
      : task.id === "vegetarian-meal"
        ? "輸入任務碼"
        : "開始補充";
  return (
    <AssetSurface
      assetId="ui_task_card"
      state={task.state}
      className="task-card"
      as="article"
      label={`${task.title}，${actionLabel}`}
    >
      <div className="task-card__icon">
        <UiIcon assetId={task.icon} />
      </div>
      <div className="task-card__copy">
        <div className="task-card__title-row">
          <h3>{task.title}</h3>
          <span className={`task-state task-state--${task.state}`}>
            {task.state === "claimed"
              ? "已完成"
              : task.state === "in_progress"
                ? "進行中"
                : "可進行"}
          </span>
        </div>
        <p>{task.description}</p>
        <strong className="task-card__reward">{task.reward}</strong>
      </div>
      <button
        type="button"
        className="task-card__action ui-control"
        onClick={onAction}
        disabled={task.state === "claimed"}
      >
        {actionLabel}
        <UiIcon
          assetId={
            task.state === "claimed" ? "ui_icon_success" : "ui_icon_chevron"
          }
        />
      </button>
    </AssetSurface>
  );
}

function InventoryCard({ item }: { item: (typeof inventoryItems)[number] }) {
  return (
    <AssetSurface
      assetId="ui_inventory_card"
      state={item.state}
      className="inventory-card"
      as="article"
      label={`${item.name}，${item.detail}`}
    >
      <UiIcon assetId={item.icon} className="inventory-card__icon" />
      <div>
        <h3>{item.name}</h3>
        <p>{item.detail}</p>
      </div>
      <UiIcon
        assetId={
          item.state === "equipped" ? "ui_icon_check" : "ui_icon_chevron"
        }
      />
    </AssetSurface>
  );
}

function SectionHeading({
  id,
  eyebrow,
  title,
  action,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow ? <span>{eyebrow}</span> : null}
        <h2 id={id}>{title}</h2>
      </div>
      {action}
    </div>
  );
}

export default function Page() {
  const [screen, setScreen] = useState<Screen>("home");
  const [player, setPlayer] = useState(previewPlayer);
  const [connection, setConnection] = useState<ConnectionState>("loading");
  const [mission, setMission] = useState<Mission | null>(null);
  const [remoteUser, setRemoteUser] = useState<UserProgress | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [taskCodeOpen, setTaskCodeOpen] = useState(false);
  const [taskCode, setTaskCode] = useState("");
  const [pendingCode, setPendingCode] = useState(false);
  const [inventoryTab, setInventoryTab] = useState<
    "items" | "vouchers" | "memories"
  >("items");
  const [toast, setToast] = useState("");
  const [reduceMotion, setReduceMotion] = useState(false);

  const refreshPlayer = useCallback(async () => {
    setConnection("loading");
    try {
      const [missionsResponse, userResponse] = await Promise.all([
        fetch(`${API_URL}/missions`),
        fetch(`${API_URL}/users/user-demo/state`),
      ]);
      if (!missionsResponse.ok || !userResponse.ok)
        throw new Error("API unavailable");
      const missions = (await missionsResponse.json()) as Mission[];
      const user = (await userResponse.json()) as UserProgress;
      setMission(missions[0] ?? null);
      setRemoteUser(user);
      setPlayer((current) => ({
        ...current,
        id: user.id,
        displayName: user.displayName,
        stars: user.stars,
      }));
      setConnection("connected");
    } catch {
      setMission(null);
      setRemoteUser(null);
      setConnection("offline");
    }
  }, []);

  useEffect(() => {
    void refreshPlayer();
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(media.matches);
    const handleChange = (event: MediaQueryListEvent) =>
      setReduceMotion(event.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [refreshPlayer]);

  useEffect(() => {
    if (!taskCodeOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTaskCodeOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [taskCodeOpen]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const activeEnrollment = useMemo(
    () =>
      remoteUser?.enrollments.find((item) => item.missionId === mission?.id),
    [mission?.id, remoteUser?.enrollments],
  );

  async function acceptRemoteMission() {
    if (!mission || isBusy || activeEnrollment) {
      setTaskCodeOpen(true);
      return;
    }
    setIsBusy(true);
    try {
      const response = await fetch(`${API_URL}/missions/${mission.id}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: player.id }),
      });
      if (!response.ok) throw new Error("accept failed");
      const result = (await response.json()) as { user: UserProgress };
      setRemoteUser(result.user);
      setToast("任務已加入，完成後請輸入店家提供的 4 碼");
      setTaskCodeOpen(true);
    } catch {
      setToast("目前離線，已保留畫面狀態；連線後再重試");
    } finally {
      setIsBusy(false);
    }
  }

  function submitTaskCode() {
    if (!/^\d{4}$/.test(taskCode)) return;
    setPendingCode(true);
    setToast("任務碼已送出，等待店家確認");
  }

  function goTo(nextScreen: Screen) {
    setScreen(nextScreen);
    window.requestAnimationFrame(() =>
      document.querySelector<HTMLElement>("#screen-title")?.focus(),
    );
  }

  const renderHome = () => (
    <>
      <h1 id="screen-title" className="sr-only" tabIndex={-1}>
        首頁
      </h1>
      <section className="home-summary" aria-label="玩家進度摘要">
        <div className="summary-row">
          <ResourceChip label={`等級 ${player.level}`}>
            <span>Lv.</span>
            <strong>{player.level}</strong>
          </ResourceChip>
          <ResourceChip
            label={`星星 ${player.stars}`}
            state={player.stars > 0 ? "gain" : "default"}
          >
            <span aria-hidden="true">★</span>
            <strong>{player.stars.toLocaleString("zh-TW")}</strong>
          </ResourceChip>
        </div>
        <ProgressMeter
          assetId="ui_exp_progress"
          tone="exp"
          label="EXP"
          value={player.exp}
          max={player.nextLevelExp}
          displayValue={`${player.exp} / ${player.nextLevelExp}`}
        />
      </section>

      <section
        className="forest-overview"
        aria-labelledby="forest-overview-title"
      >
        <div className="forest-overview__scene" aria-hidden="true">
          <div className="canopy canopy--left" />
          <div className="canopy canopy--right" />
          <div className="young-tree">
            <span />
            <i />
            <b />
          </div>
          <div className="forest-floor" />
        </div>
        <div className="forest-overview__content">
          <span className="eyebrow">我的森林・幼樹階段</span>
          <h2 id="forest-overview-title">今天也長出了一片新葉</h2>
          <p>完成有效蔬食核銷，真實減碳才會推進森林成長。</p>
          <ProgressMeter
            assetId="ui_carbon_progress"
            tone="carbon"
            label="減碳進度"
            value={player.carbonKg}
            max={player.carbonTargetKg}
            displayValue={`${player.carbonKg.toFixed(1)} / ${player.carbonTargetKg.toFixed(1)} kg CO₂e`}
          />
          <button
            type="button"
            className="inline-link ui-control"
            onClick={() => goTo("forest")}
          >
            <UiIcon assetId="ui_icon_forest_view" />
            進入我的森林
            <UiIcon assetId="ui_icon_chevron" />
          </button>
        </div>
      </section>

      <section className="content-section" aria-labelledby="today-title">
        <SectionHeading
          id="today-title"
          eyebrow="今天還有 2 件事"
          title="今日任務"
          action={
            <button
              type="button"
              className="text-action ui-control"
              onClick={() => goTo("missions")}
            >
              查看全部
            </button>
          }
        />
        <div className="task-list">
          {dailyTasks.slice(1).map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onAction={
                task.id === "vegetarian-meal"
                  ? acceptRemoteMission
                  : () => {
                      setToast("小知識已開啟");
                      goTo("missions");
                    }
              }
            />
          ))}
        </div>
      </section>

      <AssetSurface
        assetId="ui_weekly_progress"
        state="partial"
        className="weekly-card"
        as="section"
        label={`本週任務 ${player.weeklyDays} / 7 天`}
      >
        <UiIcon assetId="ui_icon_weekly_board" className="weekly-card__icon" />
        <div>
          <span>本週任務</span>
          <h2>{player.weeklyDays} / 7 天</h2>
          <p>再完成 {7 - player.weeklyDays} 天，可一次結算本週獎勵。</p>
        </div>
        <button
          type="button"
          className="round-chevron ui-control"
          aria-label="查看本週任務"
          onClick={() => goTo("missions")}
        >
          <UiIcon assetId="ui_icon_chevron" />
        </button>
      </AssetSurface>
    </>
  );

  const renderMissions = () => (
    <>
      <h1 id="screen-title" className="screen-title" tabIndex={-1}>
        任務
      </h1>
      <p className="screen-intro">
        每日與本週進度由中央任務實例計算，完成後再由正式結算入帳。
      </p>
      <AssetButton
        className="task-code-button"
        onClick={() => setTaskCodeOpen(true)}
        busy={isBusy}
      >
        <UiIcon assetId="ui_icon_task_code" />
        輸入 4 碼任務碼
      </AssetButton>
      <section className="content-section" aria-labelledby="daily-task-title">
        <SectionHeading
          id="daily-task-title"
          eyebrow="每日更新"
          title="今日任務"
        />
        <div className="task-list">
          {dailyTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onAction={
                task.id === "vegetarian-meal"
                  ? acceptRemoteMission
                  : () =>
                      setToast(
                        task.id === "daily-knowledge"
                          ? "小知識已開啟"
                          : "今日已完成簽到",
                      )
              }
            />
          ))}
        </div>
      </section>
      <AssetSurface
        assetId="ui_weekly_progress"
        state="partial"
        className="weekly-detail"
        as="section"
        label={`本週任務進度 ${player.weeklyDays} / 7 天`}
      >
        <div className="weekly-detail__head">
          <UiIcon assetId="ui_icon_weekly_board" />
          <div>
            <span>本週任務</span>
            <h2>完成 7 天行動</h2>
          </div>
          <strong>{player.weeklyDays} / 7</strong>
        </div>
        <div className="day-dots" aria-label={`已完成 ${player.weeklyDays} 天`}>
          {Array.from({ length: 7 }, (_, index) => (
            <span
              key={index}
              className={index < player.weeklyDays ? "is-complete" : ""}
            >
              {index + 1}
              <span className="sr-only">日</span>
            </span>
          ))}
        </div>
        <p>完成時一次獲得 300 星星與 150 EXP。</p>
      </AssetSurface>
      {activeEnrollment || pendingCode ? (
        <AssetSurface
          assetId="ui_settlement_card"
          state="pending"
          className="settlement-card"
          as="section"
          label="核銷等待店家確認"
        >
          <UiIcon assetId="ui_icon_timer" />
          <div>
            <h2>等待店家確認</h2>
            <p>任務與獎勵尚未永久入帳，可安全離開後再回來查詢。</p>
          </div>
          <UiIcon assetId="ui_icon_sync" />
        </AssetSurface>
      ) : null}
      <button
        type="button"
        className="source-link ui-control"
        onClick={() => setToast("來源：Looper MVP v1.0 Master Spec")}
      >
        <UiIcon assetId="ui_icon_source" />
        查看任務與獎勵來源
      </button>
    </>
  );

  const renderExchange = () => (
    <>
      <h1 id="screen-title" className="screen-title" tabIndex={-1}>
        星星兌換
      </h1>
      <p className="screen-intro">
        只顯示目前持有星星與券價；兌換前可查看接受分店與最低使用保障。
      </p>
      <div className="exchange-balance">
        <ResourceChip label={`可用星星 ${player.stars}`} state="full">
          <span aria-hidden="true">★</span>
          <strong>{player.stars.toLocaleString("zh-TW")}</strong>
          <small>可用星星</small>
        </ResourceChip>
      </div>
      <section className="voucher-grid" aria-label="可兌換平台通用券">
        {[
          { amount: 50, price: 10000, available: false },
          { amount: 100, price: 20000, available: false },
        ].map((voucher) => (
          <AssetSurface
            key={voucher.amount}
            assetId="ui_inventory_card"
            state={voucher.available ? "owned" : "locked"}
            className="voucher-card"
            as="article"
            label={`${voucher.amount} 元平台通用券，${voucher.price} 星星`}
          >
            <UiIcon
              assetId={voucher.available ? "ui_icon_coupon" : "ui_icon_lock"}
              className="voucher-card__icon"
            />
            <span>平台通用券</span>
            <h2>NT$ {voucher.amount}</h2>
            <strong>{voucher.price.toLocaleString("zh-TW")} 星星</strong>
            <AssetButton
              assetId="ui_button_secondary"
              disabled={!voucher.available}
            >
              {voucher.available ? "確認兌換" : "星星不足"}
            </AssetButton>
          </AssetSurface>
        ))}
      </section>
      <AssetSurface
        assetId="ui_speech_bubble_system"
        state="warning"
        className="exchange-note"
        label="兌換提醒"
      >
        <UiIcon assetId="ui_icon_warning" />
        <p>兌換完成後才建立正式持有券；畫面動畫不控制玩家權益。</p>
      </AssetSurface>
      <button
        type="button"
        className="list-row ui-control"
        onClick={() => setToast("我的券已開啟")}
      >
        <UiIcon assetId="ui_icon_vouchers" />
        <span>
          <strong>我的券</strong>
          <small>可用、使用中與歷史紀錄</small>
        </span>
        <UiIcon assetId="ui_icon_chevron" />
      </button>
    </>
  );

  const renderForest = () => (
    <>
      <h1 id="screen-title" className="screen-title" tabIndex={-1}>
        我的森林
      </h1>
      <div className="forest-toolbar" aria-label="森林編輯工具">
        <IconButton icon="ui_icon_preview" label="預覽森林" />
        <IconButton icon="ui_icon_rotate" label="左右轉向" />
        <IconButton icon="ui_icon_save" label="保存配置" selected />
      </div>
      <RuntimeAssemblyRenderer />
      <section
        className="content-section"
        aria-labelledby="forest-actions-title"
      >
        <SectionHeading
          id="forest-actions-title"
          eyebrow="MVP 僅開放靜態預覽"
          title="日常照料動作"
        />
        <div className="action-grid">
          {forestActions.map((action) => (
            <button
              type="button"
              className="action-tile ui-control"
              key={action.label}
              onClick={() =>
                setToast(`${action.label}目前為靜態預覽，動態遮擋仍待完成`)
              }
            >
              <UiIcon assetId={action.icon} />
              <strong>{action.label}</strong>
              <span>{action.state}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="inventory-section" aria-labelledby="inventory-title">
        <SectionHeading
          id="inventory-title"
          title="物品庫"
          action={
            <div className="inventory-shortcuts">
              <IconButton icon="ui_icon_backpack" label="背包" selected />
              <IconButton icon="ui_icon_toolbox" label="道具箱" />
            </div>
          }
        />
        <div className="inventory-tabs" role="tablist" aria-label="物品庫分類">
          {(
            [
              ["items", "小物", "ui_icon_backpack"],
              ["vouchers", "我的券", "ui_icon_vouchers"],
              ["memories", "回憶", "ui_icon_memory"],
            ] as const
          ).map(([id, label, icon]) => (
            <button
              key={id}
              id={`inventory-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={inventoryTab === id}
              aria-controls="inventory-panel"
              className="inventory-tab ui-control"
              onClick={() => setInventoryTab(id)}
            >
              <img
                src={uiAssetPath(
                  "ui_inventory_tab",
                  inventoryTab === id ? "selected" : "default",
                )}
                alt=""
                aria-hidden="true"
              />
              <span>
                <UiIcon assetId={icon} />
                {label}
              </span>
            </button>
          ))}
        </div>
        <div
          id="inventory-panel"
          role="tabpanel"
          aria-labelledby={`inventory-tab-${inventoryTab}`}
          className="inventory-list"
        >
          {inventoryTab === "items" ? (
            inventoryItems.map((item) => (
              <InventoryCard key={item.id} item={item} />
            ))
          ) : (
            <AssetSurface
              assetId="ui_empty_state"
              state="no_data"
              className="empty-panel"
            >
              <UiIcon
                assetId={
                  inventoryTab === "vouchers"
                    ? "ui_icon_vouchers"
                    : "ui_icon_memory"
                }
              />
              <h3>
                {inventoryTab === "vouchers"
                  ? "目前沒有可用券"
                  : "回憶會留在這裡"}
              </h3>
              <p>完成對應內容後，中央持有紀錄會在這裡顯示。</p>
            </AssetSurface>
          )}
        </div>
      </section>
    </>
  );

  const renderSettings = () => (
    <>
      <h1 id="screen-title" className="screen-title" tabIndex={-1}>
        設定
      </h1>
      <p className="screen-intro">
        顯示、動態與輔助功能只影響介面呈現，不改變正式交易或玩家權益。
      </p>
      <section className="settings-group" aria-labelledby="accessibility-title">
        <SectionHeading id="accessibility-title" title="輔助使用" />
        <label className="setting-row">
          <UiIcon assetId={reduceMotion ? "ui_icon_lock" : "ui_icon_unlock"} />
          <span>
            <strong>減少動態效果</strong>
            <small>停用非必要位移、閃爍與循環動畫</small>
          </span>
          <input
            type="checkbox"
            checked={reduceMotion}
            onChange={(event) => setReduceMotion(event.target.checked)}
          />
        </label>
        <div className="setting-row">
          <UiIcon assetId="ui_icon_info" />
          <span>
            <strong>文字大小</strong>
            <small>跟隨 iOS Dynamic Type 或 Android 系統字級</small>
          </span>
          <UiIcon assetId="ui_icon_chevron" />
        </div>
        <div className="setting-row">
          <UiIcon assetId="ui_icon_question" />
          <span>
            <strong>輔助說明</strong>
            <small>VoiceOver 與 TalkBack 操作提示</small>
          </span>
          <UiIcon assetId="ui_icon_chevron" />
        </div>
      </section>
      <section className="settings-group" aria-labelledby="connection-title">
        <SectionHeading id="connection-title" title="資料與連線" />
        <div className="setting-row">
          <UiIcon
            assetId={
              connection === "connected"
                ? "ui_icon_success"
                : connection === "loading"
                  ? "ui_icon_loading"
                  : "ui_icon_offline"
            }
            className={connection === "loading" ? "spinning-icon" : ""}
          />
          <span>
            <strong>
              {connection === "connected"
                ? "已連上中央資料"
                : connection === "loading"
                  ? "正在同步"
                  : "離線預覽"}
            </strong>
            <small>
              {connection === "offline"
                ? "顯示規格預覽資料，不會寫入正式帳本"
                : "玩家資源由後端回傳"}
            </small>
          </span>
          <button
            type="button"
            className="retry-button ui-control"
            onClick={() => void refreshPlayer()}
          >
            <UiIcon assetId="ui_icon_retry" />
            <span className="sr-only">重新同步</span>
          </button>
        </div>
        <button
          type="button"
          className="setting-row setting-row--button ui-control"
          onClick={() => setToast("同步狀態已更新")}
        >
          <UiIcon assetId="ui_icon_sync" />
          <span>
            <strong>上次同步</strong>
            <small>剛剛</small>
          </span>
          <UiIcon assetId="ui_icon_chevron" />
        </button>
      </section>
      {connection === "offline" ? (
        <AssetSurface
          assetId="ui_empty_state"
          state="offline"
          className="offline-panel"
          label="離線預覽"
        >
          <UiIcon assetId="ui_icon_error" />
          <div>
            <h2>中央 API 尚未連線</h2>
            <p>目前可檢查完整玩家介面；正式資源與交易動作維持唯讀。</p>
          </div>
        </AssetSurface>
      ) : connection === "loading" ? (
        <AssetSurface
          assetId="ui_skeleton"
          state={reduceMotion ? "reduced_motion" : "static"}
          className="loading-panel"
        >
          <span className="sr-only">正在載入設定資料</span>
        </AssetSurface>
      ) : null}
      <AssetButton
        assetId="ui_button_tertiary"
        onClick={() => setToast("客服與必要說明已開啟")}
      >
        <UiIcon assetId="ui_icon_menu" />
        必要說明與客服
      </AssetButton>
    </>
  );

  const screens: Record<Screen, () => React.ReactNode> = {
    home: renderHome,
    missions: renderMissions,
    exchange: renderExchange,
    forest: renderForest,
    settings: renderSettings,
  };
  const navigation = [
    {
      id: "missions" as const,
      label: "任務",
      icon: "ui_icon_nav_mission" as UiAssetId,
    },
    {
      id: "exchange" as const,
      label: "星星兌換",
      icon: "ui_icon_nav_exchange" as UiAssetId,
    },
    {
      id: "forest" as const,
      label: "我的森林",
      icon: "ui_icon_nav_forest" as UiAssetId,
    },
    {
      id: "settings" as const,
      label: "設定",
      icon: "ui_icon_nav_settings" as UiAssetId,
    },
  ];

  return (
    <main className={`player-shell ${reduceMotion ? "reduce-motion" : ""}`}>
      <div
        className="player-app"
        aria-hidden={taskCodeOpen || undefined}
        inert={taskCodeOpen || undefined}
      >
        {connection !== "connected" ? (
          <div
            className={`connection-banner connection-banner--${connection}`}
            role="status"
          >
            <UiIcon
              assetId={
                connection === "loading" ? "ui_icon_loading" : "ui_icon_offline"
              }
              className={connection === "loading" ? "spinning-icon" : ""}
            />
            <span>
              {connection === "loading"
                ? "正在同步中央資料"
                : "離線預覽・正式交易維持唯讀"}
            </span>
          </div>
        ) : null}
        <header className="player-header">
          <button
            type="button"
            className="profile-home ui-control"
            aria-label="返回首頁"
            onClick={() => goTo("home")}
          >
            <UiIcon assetId="ui_icon_profile" className="profile-icon" />
            <span>
              <small>早安</small>
              <strong>{player.displayName}</strong>
            </span>
            <UiIcon assetId="ui_icon_home" className="home-mark" />
          </button>
          <IconButton icon="ui_icon_notification" label="通知" />
        </header>

        <div className="screen-content">{screens[screen]()}</div>

        <nav className="bottom-navigation" aria-label="主要導覽">
          {navigation.map((item) => {
            const selected = screen === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className="bottom-navigation__item ui-control"
                aria-current={selected ? "page" : undefined}
                onClick={() => goTo(item.id)}
              >
                <img
                  className="bottom-navigation__art"
                  src={uiAssetPath(
                    "ui_bottom_nav_item",
                    selected ? "selected" : "default",
                  )}
                  alt=""
                  aria-hidden="true"
                />
                <span>
                  <UiIcon
                    assetId={item.icon}
                    state={selected ? "focused" : "default"}
                  />
                  <small>{item.label}</small>
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {taskCodeOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setTaskCodeOpen(false);
          }}
        >
          <AssetSurface
            assetId="ui_dialog"
            state={pendingCode ? "loading" : "default"}
            className="task-code-dialog"
            labelledBy="task-code-title"
            role="dialog"
            ariaModal
          >
            <div className="dialog-actions">
              <button
                type="button"
                className="dialog-icon-button ui-control"
                aria-label="返回"
                onClick={() => setTaskCodeOpen(false)}
              >
                <UiIcon assetId="ui_icon_back" />
              </button>
              <button
                type="button"
                className="dialog-icon-button ui-control"
                aria-label="關閉"
                onClick={() => setTaskCodeOpen(false)}
              >
                <UiIcon assetId="ui_icon_close" />
              </button>
            </div>
            <UiIcon
              assetId={pendingCode ? "ui_icon_timer" : "ui_icon_task_code"}
              className="dialog-hero-icon"
            />
            <h2 id="task-code-title">
              {pendingCode ? "等待店家確認" : "輸入店家提供的 4 碼"}
            </h2>
            <p id="task-code-help">
              送出後會建立 merchant pending；正式獎勵會在店家確認並完成 settled
              後入帳。
            </p>
            {pendingCode ? (
              <AssetSurface
                assetId="ui_settlement_card"
                state="pending"
                className="dialog-pending"
              >
                <UiIcon assetId="ui_icon_sync" className="spinning-icon" />
                <span>可以安全離開，稍後回來查詢原結果。</span>
              </AssetSurface>
            ) : (
              <>
                <label className="task-code-label" htmlFor="task-code">
                  4 碼任務碼
                </label>
                <input
                  id="task-code"
                  className="task-code-input"
                  value={taskCode}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={4}
                  aria-describedby="task-code-help"
                  autoFocus
                  onChange={(event) =>
                    setTaskCode(
                      event.target.value.replace(/\D/g, "").slice(0, 4),
                    )
                  }
                />
                <AssetButton
                  onClick={submitTaskCode}
                  disabled={!/^\d{4}$/.test(taskCode)}
                >
                  送出任務碼
                </AssetButton>
                <AssetButton
                  assetId="ui_button_tertiary"
                  onClick={() => {
                    setTaskCode("");
                    setTaskCodeOpen(false);
                  }}
                >
                  <UiIcon assetId="ui_icon_cancel" />
                  取消
                </AssetButton>
              </>
            )}
          </AssetSurface>
        </div>
      ) : null}

      {toast ? (
        <AssetSurface
          assetId="ui_toast"
          state={connection === "offline" ? "warning" : "success"}
          className="live-toast"
          label="狀態通知"
        >
          <UiIcon
            assetId={
              connection === "offline" ? "ui_icon_warning" : "ui_icon_success"
            }
          />
          <span role="status" aria-live="polite">
            {toast}
          </span>
        </AssetSurface>
      ) : (
        <span className="sr-only" role="status" aria-live="polite" />
      )}
    </main>
  );
}
