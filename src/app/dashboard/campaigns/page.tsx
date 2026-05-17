import { Suspense } from "react";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { CampaignDataSections } from "./data-sections";
import { getAvailableCampaignTypes } from "./query";
import { parseFilters, parseTypeFilter, resolveDateRange, type DashboardFilters } from "@/lib/dashboard-filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const metadata = { title: "Campaigns · Marketing BI" };

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const filters = parseFilters(raw);
  const dateRange = resolveDateRange(filters);
  const types = parseTypeFilter(filters.types);
  const compare = filters.compare === "1";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Campaign Contribution to SQLs</h1>
        <p className="mt-1 text-sm text-(--color-text-muted)">
          {compare
            ? "Comparing all three attribution models side-by-side. Blue = linear, amber = first-touch, red = last-touch."
            : modelDescription(filters.model)}{" "}
          Range: <strong>{dateRange.label}</strong>. See{" "}
          <a className="underline" href="/methodology">methodology</a> for full details.
        </p>
      </header>

      <Suspense fallback={<div className="h-9 animate-pulse rounded-md border bg-(--color-surface)" />}>
        <FilterBarSection model={filters.model} preset={filters.preset} types={types} compare={compare} />
      </Suspense>

      <CampaignDataSections />
    </div>
  );
}

async function FilterBarSection({
  model,
  preset,
  types,
  compare,
}: {
  model: DashboardFilters["model"];
  preset: DashboardFilters["preset"];
  types: string[] | null;
  compare: boolean;
}) {
  const availableTypes = await getAvailableCampaignTypes();
  return (
    <FilterBar
      model={model}
      preset={preset}
      types={types}
      availableTypes={availableTypes}
      compare={compare}
    />
  );
}

function modelDescription(model: string): string {
  switch (model) {
    case "first_touch":
      return "First-touch credit (1.0 to the earliest in-window touchpoint).";
    case "last_touch":
      return "Last-touch credit (1.0 to the latest in-window touchpoint).";
    case "w_shaped":
    default:
      return "W-shaped multi-touch credit (1 absolute point per qualifying touchpoint).";
  }
}
