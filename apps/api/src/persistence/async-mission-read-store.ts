import type { Mission } from "@looper/types";
import type { AsyncDatabase, AsyncQueryOptions } from "./async-contract.js";
import { validateEconomySettings } from "../store.js";

type MissionRow = {
  id: unknown;
  merchant_id: unknown;
  title: unknown;
  description: unknown;
  reward_star_amount: unknown;
  value_json: unknown;
};

function parseEconomySettings(value: unknown) {
  if (value === null) throw new Error("Missing economy_settings.core");
  if (typeof value !== "string") throw new Error("economy_settings.core must be stored as JSON text");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("economy_settings.core contains invalid JSON");
  }
  // Reuse the existing validator unchanged; this slice introduces no economy rules.
  return validateEconomySettings(parsed);
}

/**
 * Read-only adapter for the public mission catalogue.
 *
 * This deliberately has no execute/transaction path. The SQL joins the same
 * canonical tables used by InMemoryStore.mapMission and does not touch player
 * sessions or any mutable resource/settlement tables.
 */
export class AsyncMissionReadStore {
  constructor(private readonly database: AsyncDatabase) {}

  async listMissions(options: AsyncQueryOptions = {}): Promise<Mission[]> {
    const result = await this.database.query<MissionRow>(
      `SELECT
         mission.id,
         mission.merchant_id,
         mission.title,
         mission.description,
         merchant.reward_star_amount,
         settings.value_json
       FROM missions AS mission
       JOIN merchants AS merchant ON merchant.id = mission.merchant_id
       LEFT JOIN economy_settings AS settings ON settings.key = 'core'
       ORDER BY mission.created_at`,
      [],
      options,
    );
    return result.rows.map((row) => {
      const settings = parseEconomySettings(row.value_json);
      return {
        id: String(row.id ?? ""),
        merchantId: String(row.merchant_id ?? ""),
        title: String(row.title ?? ""),
        description: String(row.description ?? ""),
        starReward: Number(row.reward_star_amount ?? 0),
        energyReward: settings.redemptionEnergy,
        expReward: settings.redemptionExp,
        carbonGrams: settings.vegetarianCarbonGrams,
      } satisfies Mission;
    });
  }
}

export type AsyncMissionReadStoreLike = Pick<AsyncMissionReadStore, "listMissions">;
