import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { CampaignBarChart } from "./campaign-bar-chart";
import { CampaignTypeChart } from "./campaign-type-chart";
import { ConversionRateTable } from "./conversion-rate-table";
import {
  getAvailableCampaignTypes,
  getCampaignContributionToSqls,
  getCampaignTypeRollup,
  getConversionRateTable,
} from "./query";
import { parseFilters, parseTypeFilter, resolveDateRange, type DashboardFilters } from "@/lib/dashboard-filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const metadata = { title: "Campaigns · Marketing BI" };

interface QueryArgs {
  model: DashboardFilters["model"];
  fromDate: string | null;
  toDate: string | null;
  campaignTypes: string[] | null;
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const filters = parseFilters(raw);
  const dateRange = resolveDateRange(filters);
  const types = parseTypeFilter(filters.types);

  const queryArgs: QueryArgs = {
    model: filters.model,
    fromDate: dateRange.from,
    toDate: dateRange.to,
    campaignTypes: types,
  };

  // Re-keying every section by the active filter set forces fresh Suspense
  // boundaries on every navigation; without this, React would try to reuse
  // the previous render and queries can stall on the prior result.
  const filterKey = JSON.stringify(queryArgs);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Campaign Contribution to SQLs</h1>
        <p className="mt-1 text-sm text-(--color-text-muted)">
          {modelDescription(filters.model)} per campaign at the SQL stage. Range: <strong>{dateRange.label}</strong>.
          See <a className="underline" href="/methodology">methodology</a> for full details.
        </p>
      </header>

      <Suspense fallback={<FilterBarSkeleton />}>
        <FilterBarSection
          model={filters.model}
          preset={filters.preset}
          types={types}
        />
      </Suspense>

      <Suspense key={`top-${filterKey}`} fallback={<ChartCardSkeleton title="Top campaigns" />}>
        <TopCampaignsCard args={queryArgs} />
      </Suspense>

      <Suspense key={`type-${filterKey}`} fallback={<ChartCardSkeleton title="Credit by campaign type" />}>
        <TypeRollupCard args={queryArgs} />
      </Suspense>

      <Suspense key={`conv-${filterKey}`} fallback={<ChartCardSkeleton title="Engagement → SQL conversion rate" />}>
        <ConversionRateCard args={queryArgs} />
      </Suspense>
    </div>
  );
}

// Each section is its own async server component → Suspense streams them
// independently. The page returns to the browser before any of these resolve;
// each card renders as its query completes.

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
    <FilterBar model={model} preset={preset} types={types} availableTypes={availableTypes} />
  );
}

async function TopCampaignsCard({ args }: { args: QueryArgs }) {
  const rows = await getCampaignContributionToSqls(args, 20);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top {rows.length} campaigns</CardTitle>
        <CardDescription>
          Source: <code>mart.attribution_contact</code> · model{" "}
          <strong>{args.model.replace("_", "-")}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? <EmptyState /> : <CampaignBarChart data={rows} />}
      </CardContent>
    </Card>
  );
}

async function TypeRollupCard({ args }: { args: QueryArgs }) {
  const rows = await getCampaignTypeRollup(args);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Credit by campaign type</CardTitle>
        <CardDescription>Same model and date range, rolled up by campaign type.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? <EmptyState /> : <CampaignTypeChart data={rows} />}
      </CardContent>
    </Card>
  );
}

async function ConversionRateCard({ args }: { args: QueryArgs }) {
  const rows = await getConversionRateTable(args, 50);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Engagement → SQL conversion rate</CardTitle>
        <CardDescription>
          Distinct contacts touched by the campaign vs. those who later became SQL within the
          current filter window. Click column headers to re-sort.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ConversionRateTable data={rows} />
      </CardContent>
    </Card>
  );
}

function FilterBarSkeleton() {
  return (
    <div className="h-9 animate-pulse rounded-md border bg-(--color-surface)" />
  );
}

function ChartCardSkeleton({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-(--color-text-muted)">{title}</CardTitle>
        <CardDescription>Loading…</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[280px] animate-pulse rounded bg-(--color-surface-2)" />
      </CardContent>
    </Card>
  );
}

function modelDescription(model: string): string {
  switch (model) {
    case "first_touch":
      return "First-touch credit (1.0 to the earliest in-window touchpoint)";
    case "last_touch":
      return "Last-touch credit (1.0 to the latest in-window touchpoint)";
    case "linear":
    default:
      return "Linear-multi-touch credit (1/N split across in-window touchpoints)";
  }
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-(--color-surface) py-12 text-center">
      <p className="text-sm font-medium">No campaigns match.</p>
      <p className="max-w-sm text-xs text-(--color-text-muted)">
        Try widening the date range, removing type filters, or switching the attribution model.
      </p>
    </div>
  );
}
