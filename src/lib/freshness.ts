/**
 * Freshness pill thresholds.
 *
 * Phase 1 sync runs WEEKLY, so PLAT-05's daily thresholds (24/48h) would
 * always render red. We use weekly-tuned values; the daily values are kept
 * here as named constants so we can swap when sync moves to daily in P2.
 */

export const FRESHNESS_DAILY_HOURS = {
  green: 24,
  yellow: 48,
} as const;

export const FRESHNESS_WEEKLY_HOURS = {
  green: 8 * 24, // 8 days
  yellow: 15 * 24, // 15 days
} as const;

export type FreshnessLevel = "green" | "yellow" | "red" | "unknown";

export function freshnessLevel(
  syncedAt: Date | null,
  thresholds: { green: number; yellow: number } = FRESHNESS_DAILY_HOURS,
): FreshnessLevel {
  if (!syncedAt) return "unknown";
  const ageHours = (Date.now() - syncedAt.getTime()) / (1000 * 60 * 60);
  if (ageHours < thresholds.green) return "green";
  if (ageHours < thresholds.yellow) return "yellow";
  return "red";
}

export function freshnessLabel(syncedAt: Date | null): string {
  if (!syncedAt) return "No data yet";
  const ageMs = Date.now() - syncedAt.getTime();
  const days = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ageMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days >= 1) return `Synced ${days}d ${hours}h ago`;
  if (hours >= 1) return `Synced ${hours}h ago`;
  const mins = Math.max(1, Math.floor(ageMs / (1000 * 60)));
  return `Synced ${mins}m ago`;
}
