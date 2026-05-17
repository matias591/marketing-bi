import { Suspense } from "react";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { RevenueDataSections } from "./data-sections";
import { getAvailableCampaignTypes } from "../campaigns/query";
import { parseFilters, parseTypeFilter, resolveDateRange, type DashboardFilters } from "@/lib/dashboard-filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const metadata = { title: "Revenue · Marketing BI" };

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const filters = parseFilters({ preset: "ytd", ...raw });
  const dateRange = resolveDateRange(filters);
  const types = parseTypeFilter(filters.types);
  const compare = filters.compare === "1";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Revenue & Closed Won</h1>
        <p className="mt-1 text-sm text-(--color-text-muted)">
          {compare
            ? "Closed Won revenue attributed under all three models side-by-side."
            : <>Closed Won revenue attributed under the <strong>{filters.model.replace("_", "-")}</strong> model.</>}{" "}
          OCR contacts share the deal amount equally; each contact&apos;s share is distributed across their
          customer-stage touchpoints. Range: <strong>{dateRange.label}</strong> (close date).
        </p>
      </header>

      <Suspense fallback={<div className="h-9 animate-pulse rounded-md border bg-(--color-surface)" />}>
        <FilterBarSection model={filters.model} preset={filters.preset} types={types} compare={compare} />
      </Suspense>

      <RevenueDataSections />
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
