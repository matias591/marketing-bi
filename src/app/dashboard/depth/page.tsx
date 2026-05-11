import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { ExportCsvButton } from "@/components/dashboard/export-csv-button";
import { MobileTopList } from "@/components/dashboard/mobile-top-list";
import { DepthHistogram } from "./depth-histogram";
import { getTouchpointDepth } from "./query";
import { getAvailableCampaignTypes } from "../campaigns/query";
import { parseFilters, parseTypeFilter, resolveDateRange, type DashboardFilters } from "@/lib/dashboard-filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const metadata = { title: "Touchpoint Depth · Marketing BI" };

interface QueryArgs {
  fromDate: string | null;
  toDate: string | null;
  campaignTypes: string[] | null;
}

export default async function DepthPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const filters = parseFilters({ preset: "ytd", ...raw });
  const dateRange = resolveDateRange(filters);
  const types = parseTypeFilter(filters.types);

  const queryArgs: QueryArgs = {
    fromDate: dateRange.from,
    toDate: dateRange.to,
    campaignTypes: types,
  };
  const filterKey = JSON.stringify(queryArgs);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Touchpoint Depth Analysis</h1>
        <p className="mt-1 text-sm text-(--color-text-muted)">
          How many distinct campaigns did each Contact touch in the 90-day window before reaching
          SQL? And before becoming a Customer? Higher means longer nurture cycles. Range:{" "}
          <strong>{dateRange.label}</strong>.
        </p>
      </header>

      <Suspense fallback={<FilterBarSkeleton />}>
        <FilterBarSection model={filters.model} preset={filters.preset} types={types} />
      </Suspense>

      <Suspense key={filterKey} fallback={<DepthSkeleton />}>
        <DepthSection args={queryArgs} />
      </Suspense>
    </div>
  );
}

async function FilterBarSection({
  model,
  preset,
  types,
}: {
  model: DashboardFilters["model"];
  preset: DashboardFilters["preset"];
  types: string[] | null;
}) {
  const availableTypes = await getAvailableCampaignTypes();
  return (
    <FilterBar
      model={model}
      preset={preset}
      types={types}
      availableTypes={availableTypes}
      compare={false}
    />
  );
}

async function DepthSection({ args }: { args: QueryArgs }) {
  const stats = await getTouchpointDepth(args);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Median to SQL" value={stats.sqlMedian.toFixed(1)} hint={`from ${stats.sqlContacts.toLocaleString()} contacts`} />
        <Kpi label="Mean to SQL" value={stats.sqlMean.toFixed(1)} />
        <Kpi label="Median to Customer" value={stats.customerMedian.toFixed(1)} hint={`from ${stats.customerContacts.toLocaleString()} contacts`} />
        <Kpi label="Mean to Customer" value={stats.customerMean.toFixed(1)} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Touchpoint count distribution</CardTitle>
            <CardDescription>
              Distinct campaign touchpoints in the 90-day pre-transition window. Blue: contacts who
              reached SQL. Green: contacts who became Customer.
            </CardDescription>
          </div>
          <ExportCsvButton chart="depth" />
        </CardHeader>
        <CardContent>
          {/* Chart on desktop; vertical list on mobile (PLAT-07) */}
          <div className="hidden md:block">
            <DepthHistogram buckets={stats.buckets} />
          </div>
          <div className="md:hidden">
            <MobileTopList
              title="By touchpoint count"
              items={stats.buckets.map((b) => ({
                label: `${b.label} touchpoint${b.label === "1" ? "" : "s"}`,
                sublabel: `SQL: ${b.sql} · Customer: ${b.customer}`,
                value: String(b.sql + b.customer),
              }))}
            />
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border bg-(--color-surface) px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-(--color-text-muted)">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {hint ? <div className="text-[10px] text-(--color-text-muted)">{hint}</div> : null}
    </div>
  );
}

function FilterBarSkeleton() {
  return <div className="h-9 animate-pulse rounded-md border bg-(--color-surface)" />;
}

function DepthSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-md border bg-(--color-surface)" />
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-(--color-text-muted)">Touchpoint count distribution</CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[360px] animate-pulse rounded bg-(--color-surface-2)" />
        </CardContent>
      </Card>
    </>
  );
}
