export interface UiAssetDefinition {
  base: string;
  version: string;
  states: readonly string[];
}

const approved = (
  batch: string,
  version: string,
  states: readonly string[],
): UiAssetDefinition => ({
  base: `/visual_assets/ui/${batch}/approved/${version}`,
  version,
  states,
});

const iconStates = ["default", "pressed", "disabled", "focused"] as const;

export const UI_ASSETS = {
  ui_button_primary: approved("batch_01_core_buttons", "v003", [
    "default",
    "pressed",
    "focused",
    "disabled",
    "loading",
    "success",
  ]),
  ui_button_secondary: approved("batch_01_core_buttons", "v003", [
    "default",
    "pressed",
    "focused",
    "disabled",
    "loading",
  ]),
  ui_button_tertiary: approved("batch_01_core_buttons", "v003", [
    "default",
    "pressed",
    "focused",
    "disabled",
  ]),
  ui_carbon_progress: approved("batch_02_progress_systems", "v003", [
    "empty",
    "partial",
    "threshold",
    "overflow",
  ]),
  ui_energy_progress: approved("batch_02_progress_systems", "v003", [
    "partial",
    "full",
    "insufficient",
    "recovering",
  ]),
  ui_exp_progress: approved("batch_02_progress_systems", "v003", [
    "empty",
    "partial",
    "complete",
    "max",
  ]),
  ui_dialog: approved("batch_03_feedback_surfaces", "v002", [
    "default",
    "destructive",
    "loading",
    "error",
  ]),
  ui_empty_state: approved("batch_03_feedback_surfaces", "v002", [
    "no_data",
    "locked",
    "maintenance",
    "offline",
  ]),
  ui_toast: approved("batch_03_feedback_surfaces", "v002", [
    "info",
    "success",
    "warning",
    "error",
  ]),
  ui_bottom_nav_item: approved("batch_04_navigation_status", "v002", [
    "default",
    "selected",
    "pressed",
    "badge",
  ]),
  ui_icon_button: approved("batch_04_navigation_status", "v002", [
    "default",
    "pressed",
    "focused",
    "disabled",
    "selected",
  ]),
  ui_resource_chip: approved("batch_04_navigation_status", "v002", [
    "default",
    "gain",
    "full",
    "insufficient",
    "locked",
  ]),
  ui_icon_back: approved(
    "batch_05_system_navigation_glyphs",
    "v001",
    iconStates,
  ),
  ui_icon_chevron: approved(
    "batch_05_system_navigation_glyphs",
    "v001",
    iconStates,
  ),
  ui_icon_close: approved(
    "batch_05_system_navigation_glyphs",
    "v001",
    iconStates,
  ),
  ui_icon_error: approved("batch_06_system_status_glyphs", "v001", iconStates),
  ui_icon_info: approved("batch_06_system_status_glyphs", "v001", iconStates),
  ui_icon_warning: approved(
    "batch_06_system_status_glyphs",
    "v001",
    iconStates,
  ),
  ui_icon_loading: approved(
    "batch_07_system_feedback_glyphs",
    "v001",
    iconStates,
  ),
  ui_icon_question: approved(
    "batch_07_system_feedback_glyphs",
    "v001",
    iconStates,
  ),
  ui_icon_success: approved(
    "batch_07_system_feedback_glyphs",
    "v001",
    iconStates,
  ),
  ui_icon_lock: approved("batch_08_access_recovery_glyphs", "v001", iconStates),
  ui_icon_offline: approved(
    "batch_08_access_recovery_glyphs",
    "v001",
    iconStates,
  ),
  ui_icon_retry: approved(
    "batch_08_access_recovery_glyphs",
    "v001",
    iconStates,
  ),
  ui_icon_sync: approved(
    "batch_09_state_transition_glyphs",
    "v001",
    iconStates,
  ),
  ui_icon_timer: approved(
    "batch_09_state_transition_glyphs",
    "v001",
    iconStates,
  ),
  ui_icon_unlock: approved(
    "batch_09_state_transition_glyphs",
    "v001",
    iconStates,
  ),
  ui_icon_menu: approved("batch_10_global_topbar_glyphs", "v001", iconStates),
  ui_icon_notification: approved(
    "batch_10_global_topbar_glyphs",
    "v001",
    iconStates,
  ),
  ui_icon_profile: approved(
    "batch_10_global_topbar_glyphs",
    "v001",
    iconStates,
  ),
  ui_icon_preview: approved(
    "batch_11_arrange_action_glyphs",
    "v001",
    iconStates,
  ),
  ui_icon_rotate: approved(
    "batch_11_arrange_action_glyphs",
    "v001",
    iconStates,
  ),
  ui_icon_save: approved("batch_11_arrange_action_glyphs", "v001", iconStates),
  ui_icon_sit: approved("batch_12_home_action_glyphs", "v001", iconStates),
  ui_icon_snack: approved("batch_12_home_action_glyphs", "v001", iconStates),
  ui_icon_tidy: approved("batch_12_home_action_glyphs", "v001", iconStates),
  ui_icon_character_tap: approved(
    "batch_13_direct_interaction_glyphs",
    "v001",
    iconStates,
  ),
  ui_icon_light: approved(
    "batch_13_direct_interaction_glyphs",
    "v001",
    iconStates,
  ),
  ui_icon_water: approved(
    "batch_13_direct_interaction_glyphs",
    "v001",
    iconStates,
  ),
  ui_icon_compost: approved(
    "batch_14_home_forest_entry_icons",
    "v001",
    iconStates,
  ),
  ui_icon_forest_view: approved(
    "batch_14_home_forest_entry_icons",
    "v001",
    iconStates,
  ),
  ui_icon_home: approved(
    "batch_14_home_forest_entry_icons",
    "v001",
    iconStates,
  ),
  ui_icon_treehouse: approved(
    "batch_14_home_forest_entry_icons",
    "v001",
    iconStates,
  ),
  ui_icon_weekly_board: approved(
    "batch_14_home_forest_entry_icons",
    "v001",
    iconStates,
  ),
  ui_focus_ring: approved("batch_15_access_inventory_actions", "v001", [
    "visible",
  ]),
  ui_icon_backpack: approved(
    "batch_15_access_inventory_actions",
    "v001",
    iconStates,
  ),
  ui_icon_cancel: approved(
    "batch_15_access_inventory_actions",
    "v001",
    iconStates,
  ),
  ui_icon_check: approved(
    "batch_15_access_inventory_actions",
    "v001",
    iconStates,
  ),
  ui_icon_coupon: approved(
    "batch_15_access_inventory_actions",
    "v001",
    iconStates,
  ),
  ui_icon_equip: approved(
    "batch_16_navigation_content_icons",
    "v001",
    iconStates,
  ),
  ui_icon_knowledge: approved(
    "batch_16_navigation_content_icons",
    "v001",
    iconStates,
  ),
  ui_icon_memory: approved(
    "batch_16_navigation_content_icons",
    "v001",
    iconStates,
  ),
  ui_icon_nav_exchange: approved(
    "batch_16_navigation_content_icons",
    "v001",
    iconStates,
  ),
  ui_icon_nav_forest: approved(
    "batch_16_navigation_content_icons",
    "v001",
    iconStates,
  ),
  ui_icon_nav_mission: approved(
    "batch_17_mission_settings_utility_icons",
    "v001",
    iconStates,
  ),
  ui_icon_nav_settings: approved(
    "batch_17_mission_settings_utility_icons",
    "v001",
    iconStates,
  ),
  ui_icon_source: approved(
    "batch_17_mission_settings_utility_icons",
    "v001",
    iconStates,
  ),
  ui_icon_task_code: approved(
    "batch_17_mission_settings_utility_icons",
    "v001",
    iconStates,
  ),
  ui_icon_toolbox: approved(
    "batch_17_mission_settings_utility_icons",
    "v001",
    iconStates,
  ),
  ui_icon_vouchers: approved(
    "batch_18_inventory_settlement_loading",
    "v001",
    iconStates,
  ),
  ui_inventory_card: approved("batch_18_inventory_settlement_loading", "v001", [
    "locked",
    "owned",
    "equipped",
    "placed",
    "unavailable",
  ]),
  ui_inventory_tab: approved("batch_18_inventory_settlement_loading", "v001", [
    "default",
    "selected",
    "disabled",
  ]),
  ui_settlement_card: approved(
    "batch_18_inventory_settlement_loading",
    "v001",
    ["pending", "settled", "reversed", "corrected"],
  ),
  ui_skeleton: approved("batch_18_inventory_settlement_loading", "v001", [
    "static",
    "reduced_motion",
  ]),
  ui_speech_bubble_left: approved("batch_19_dialog_task_progress", "v001", [
    "default",
    "large_text",
  ]),
  ui_speech_bubble_right: approved("batch_19_dialog_task_progress", "v001", [
    "default",
    "large_text",
  ]),
  ui_speech_bubble_system: approved("batch_19_dialog_task_progress", "v001", [
    "default",
    "warning",
  ]),
  ui_task_card: approved("batch_19_dialog_task_progress", "v001", [
    "loading",
    "available",
    "in_progress",
    "completed",
    "claimed",
    "unavailable",
    "expired",
  ]),
  ui_weekly_progress: approved("batch_19_dialog_task_progress", "v001", [
    "empty",
    "partial",
    "complete",
    "settled",
    "reset",
  ]),
} as const;

export type UiAssetId = keyof typeof UI_ASSETS;

export function uiAssetPath(assetId: UiAssetId, state: string): string {
  const asset = UI_ASSETS[assetId];
  if (!asset.states.includes(state as never)) {
    throw new Error(`${assetId} 不支援狀態 ${state}`);
  }
  return `${asset.base}/exports/${assetId}/${state}/${assetId}_${state}_${asset.version}.svg`;
}

export function uiMasterPath(assetId: UiAssetId): string {
  const asset = UI_ASSETS[assetId];
  return `${asset.base}/master/${assetId}_${asset.version}_master.svg`;
}
