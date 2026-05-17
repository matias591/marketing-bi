import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { ExportCsvButton } from "@/components/dashboard/export-csv-button";
import { FunnelOverview, FunnelTrend } from "./funnel-chart";
import { getFunnelCounts, getFunnelTrend } from "./query";
import { getAvailableCampaignTypes } from "../campaigns/query";
import { parseFilters, parseTypeFilter, resolveDateRange, type DashboardFilters } from "@/lib/dashboard-filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const metadata = { title: "Funnel · Marketing BI" };

interface QueryArgs {
  fromDate: string | null;
  toDate: string | null;
}

export default async function FunnelPage({
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
  };
  const filterKey = JSON.stringify(queryArgs);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Funnel</h1>
        <p className="mt-1 text-sm text-(--color-text-muted)">
          MQL → SQL → Opportunity → Customer counts and stage conversion rates.
          Each count shows contacts who <em>reached that stage</em> during the period.
          Range: <strong>{dateRange.label}</strong>.
        </p>
      </header>

      <Suspense fallback={<FilterBarSkeleton />}>
        <FilterBarSection model={filters.model} preset={filters.preset} types={types} />
      </Suspense>

      <Suspense key={filterKey} fallback={<FunnelSkeleton />}>
        <FunnelSection args={queryArgs} />
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

async function FunnelSection({ args }: { args: QueryArgs }) {
  const [stages, trend] = await Promise.all([
    getFunnelCounts(args),
    getFunnelTrend(args),
  ]);

  const fmtPct = (v: number | null) =>
    v == null ? "—" : `${(v * 100).toFixed(1)}%`;

  return (
    <>
      {/* Stage count KPIs + conversion rates */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stages.map((s) => (
          <div key={s.stage} className="rounded-md border bg-(--color-surface) px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-(--color-text-muted)">{s.stage}</div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums">
              {s.contacts.toLocaleString()}
            </div>
            <div className="text-[10px] text-(--color-text-muted)">
              {s.conversionFromPrev != null
                ? `${fmtPct(s.conversionFromPrev)} from previous`
                : "starting stage"}
            </div>
          </div>
        ))}
      </div>

      {/* Funnel bar chart */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Stage counts</CardTitle>
            <CardDescription>
              Contacts who reached each stage during the selected period.
              Conversion rates show stage-to-stage drop-off.
            </CardDescription>
          </div>
          <ExportCsvButton chart="funnel" />
        </CardHeader>
        <CardContent>
          <FunnelOverview stages={stages} />
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-(--color-text-muted)">
            {stages.slice(1).map((s) => (
              <span key={s.stage}>
                {stages[stages.indexOf(s) - 1].stage} → {s.stage}:{" "}
                <strong className="text-(--color-text)">{fmtPct(s.conversionFromPrev)}</strong>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Monthly trend */}
      {trend.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Monthly stage trends</CardTitle>
            <CardDescription>
              Contacts reaching each stage per calendar month.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FunnelTrend rows={trend} />
          </CardContent>
        </Card>
      )}
    </>
  );
}

function FilterBarSkeleton() {
  return <div className="h-9 animate-pulse rounded-md border bg-(--color-surface)" />;
}

function FunnelSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-md border bg-(--color-surface)" />
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-(--color-text-muted)">Stage counts</CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[280px] animate-pulse rounded bg-(--color-surface-2)" />
        </CardContent>
      </Card>
    </>
  );
}
