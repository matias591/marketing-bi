/**
 * URL-stateful dashboard filters (PLAT-04).
 *
 * Every filter, model toggle, and date range lives in URL `searchParams` so
 * a refresh or copy-link preserves the exact view. Filters are zod-parsed
 * with safe defaults so a malformed URL never breaks the page.
 *
 * The schema is shared between Server Components (page.tsx — reads filters,
 * runs queries) and Client Components (filter-bar.tsx — writes filters via
 * router.replace).
 */
import { z } from "zod";

export const ATTRIBUTION_MODELS = ["w_shaped", "first_touch", "last_touch"] as const;
export type AttributionModel = (typeof ATTRIBUTION_MODELS)[number];

export const DATE_PRESETS = [
  "last_7_days",
  "last_30_days",
  "last_90_days",
  "this_month",
  "last_month",
  "this_quarter",
  "last_quarter",
  "ytd",
  "all_time",
  "custom",
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export const FilterSchema = z.object({
  model: z.enum(ATTRIBUTION_MODELS).default("w_shaped"),
  preset: z.enum(DATE_PRESETS).default("last_90_days"),
  // Custom date range — only used when preset === "custom"
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // Comma-separated campaign types (e.g. "Webinar registration,Webinar invites")
  // Empty / missing = all types
  types: z.string().optional(),
  // Compare mode: when "1", charts show all three attribution models
  // simultaneously as grouped bars (DASH-12).
  compare: z.enum(["1"]).optional(),
});

export type DashboardFilters = z.infer<typeof FilterSchema>;

export interface ResolvedDateRange {
  /** ISO date or null = no lower bound */
  from: string | null;
  /** ISO date or null = no upper bound */
  to: string | null;
  label: string;
}

/**
 * Convert a zod-parsed filter set into an absolute date range. Pure date math
 * in UTC — matches Postgres's `date - INTERVAL` semantics. Phase 4 will swap
 * to `AT TIME ZONE` once the BUSINESS_TIMEZONE env var is wired through
 * (PLAT-06 follow-up).
 */
export function resolveDateRange(filters: DashboardFilters, today = new Date()): ResolvedDateRange {
  const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const shift = (d: Date, days: number) => {
    const out = new Date(d);
    out.setUTCDate(out.getUTCDate() + days);
    return out;
  };

  switch (filters.preset) {
    case "last_7_days":
      return { from: iso(shift(t, -7)), to: iso(t), label: "Last 7 days" };
    case "last_30_days":
      return { from: iso(shift(t, -30)), to: iso(t), label: "Last 30 days" };
    case "last_90_days":
      return { from: iso(shift(t, -90)), to: iso(t), label: "Last 90 days" };
    case "this_month": {
      const start = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
      return { from: iso(start), to: iso(t), label: "This month" };
    }
    case "last_month": {
      const start = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1));
      const end = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0));
      return { from: iso(start), to: iso(end), label: "Last month" };
    }
    case "this_quarter": {
      const q = Math.floor(t.getUTCMonth() / 3);
      const start = new Date(Date.UTC(t.getUTCFullYear(), q * 3, 1));
      return { from: iso(start), to: iso(t), label: "This quarter" };
    }
    case "last_quarter": {
      const q = Math.floor(t.getUTCMonth() / 3);
      const start = new Date(Date.UTC(t.getUTCFullYear(), (q - 1) * 3, 1));
      const end = new Date(Date.UTC(t.getUTCFullYear(), q * 3, 0));
      return { from: iso(start), to: iso(end), label: "Last quarter" };
    }
    case "ytd": {
      const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
      return { from: iso(start), to: iso(t), label: "Year to date" };
    }
    case "all_time":
      return { from: null, to: null, label: "All time" };
    case "custom":
      return {
        from: filters.from ?? null,
        to: filters.to ?? null,
        label: `${filters.from ?? "—"} to ${filters.to ?? "—"}`,
      };
  }
}

/**
 * Parse a Next.js `searchParams` object into validated filters. Anything
 * malformed gets dropped to the default (zod's `.default()` handles it).
 */
export function parseFilters(input: Record<string, string | string[] | undefined>): DashboardFilters {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "string") flat[k] = v;
    else if (Array.isArray(v) && typeof v[0] === "string") flat[k] = v[0];
  }
  return FilterSchema.parse({
    model: flat.model,
    preset: flat.preset,
    from: flat.from,
    to: flat.to,
    types: flat.types,
    compare: flat.compare,
  });
}

/**
 * Build a query string from a partial filter set, preserving any other
 * params already in the URL.
 */
export function filterUpdateUrl(
  current: URLSearchParams,
  patch: Partial<DashboardFilters>,
): string {
  const next = new URLSearchParams(current);
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === "" || v === null) {
      next.delete(k);
    } else {
      next.set(k, String(v));
    }
  }
  return `?${next.toString()}`;
}

export function parseTypeFilter(types: string | undefined): string[] | null {
  if (!types) return null;
  const arr = types.split(",").map((s) => s.trim()).filter(Boolean);
  return arr.length > 0 ? arr : null;
}
