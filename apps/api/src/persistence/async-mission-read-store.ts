import type { Mission } from "@looper/types";
import type { AsyncDatabase, AsyncQueryOptions } from "./async-contract.js";

type MissionRow = {
  id: unknown;
  merchant_id: unknown;
  title: unknown;
  description: unknown;
  reward_star_amount: unknown;
  value_json: unknown;
};

type EconomySettings = {
  vegetarianCarbonGrams: number;
  redemptionEnergy: number;
  redemptionExp: number;
};

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid ${field} in async mission read`);
  }
  return value;
}

function requiredNumber(value: unknown, field: string): number {
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(result)) throw new Error(`Invalid ${field} in async mission read`);
  return result;
}

function parseEconomySettings(value: unknown): EconomySettings {
  let parsed: unknown = value;
  if (typeof value === "string") parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid economy settings in async mission read");
  }
  const record = parsed as Record<string, unknown>;
  return {
    vegetarianCarbonGrams: requiredNumber(record.vegetarianCarbonGrams, "vegetarianCarbonGrams"),
    redemptionEnergy: requiredNumber(record.redemptionEnergy, "redemptionEnergy"),
    redemptionExp: requiredNumber(record.redemptionExp, "redemptionExp"),
  };
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
       CROSS JOIN economy_settings AS settings
       WHERE settings.key = 'core'
       ORDER BY mission.created_at`,
      [],
      options,
    );
    return result.rows.map((row) => {
      const settings = parseEconomySettings(row.value_json);
      return {
        id: requiredString(row.id, "mission.id"),
        merchantId: requiredString(row.merchant_id, "mission.merchant_id"),
        title: requiredString(row.title, "mission.title"),
        description: requiredString(row.description, "mission.description"),
        starReward: requiredNumber(row.reward_star_amount, "merchant.reward_star_amount"),
        energyReward: settings.redemptionEnergy,
        expReward: settings.redemptionExp,
        carbonGrams: settings.vegetarianCarbonGrams,
      } satisfies Mission;
    });
  }
}

export type AsyncMissionReadStoreLike = Pick<AsyncMissionReadStore, "listMissions">;
