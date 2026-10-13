/** Pure canonical regeneration arithmetic. Callers retain clocks and all IO. */
export function calculateEnergyRegeneration(input: {
  currentEnergy: number; maxEnergy: number; interval: number;
  lastUpdated: number; nowMs: number;
}) {
  const { currentEnergy, maxEnergy, interval, lastUpdated, nowMs } = input;
  if (maxEnergy <= 0 || interval <= 0 || !Number.isFinite(lastUpdated) || nowMs <= lastUpdated) return null;
  const elapsedSeconds = Math.floor((nowMs - lastUpdated) / 1000);
  const ticks = Math.floor(elapsedSeconds / interval);
  if (ticks <= 0) return null;
  const nextLast = new Date(lastUpdated + ticks * interval * 1000).toISOString();
  const atCap = currentEnergy >= maxEnergy;
  const recovered = atCap ? 0 : Math.min(ticks, maxEnergy - currentEnergy);
  return { ticks, nextLast, atCap, recovered, nextEnergy: currentEnergy + recovered };
}
