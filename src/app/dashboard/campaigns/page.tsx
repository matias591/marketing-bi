import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { ExcludedReasons } from "@/components/dashboard/excluded-reasons";
import { ExportCsvButton } from "@/components/dashboard/export-csv-button";
import { MobileTopList } from "@/components/dashboard/mobile-top-list";
import { CampaignBarChart } from "./campaign-bar-chart";
import { CampaignTypeChart } from "./campaign-type-chart";
import { ConversionRateTable } from "./conversion-rate-table";
import { ComparisonChart } from "./comparison-chart";
import {
  getAvailableCampaignTypes,
  getCampaignContributionToSqls,
  getCampaignContributionComparison,
  getCampaignTypeRollup,
  getCampaignTypeRollupComparison,
  getCampaignsExclusionCounts,
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
  const compare = filters.compare === "1";

  const queryArgs: QueryArgs = {
    model: filters.model,
    fromDate: dateRange.from,
    toDate: dateRange.to,
    campaignTypes: types,
  };
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

      <Suspense fallback={<FilterBarSkeleton />}>
        <FilterBarSection
          model={filters.model}
          preset={filters.preset}
          types={types}
          compare={compare}
        />
      </Suspense>

      <Suspense fallback={<ChartCardSkeleton title="Top campaigns" />}>
        <TopCampaignsCard args={queryArgs} compare={compare} />
      </Suspense>

      <Suspense fallback={<ChartCardSkeleton title="Credit by campaign type" />}>
        <TypeRollupCard args={queryArgs} compare={compare} />
      </Suspense>

      <Suspense fallback={<ChartCardSkeleton title="Engagement → SQL conversion rate" />}>
        <ConversionRateCard args={queryArgs} />
      </Suspense>
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

async function TopCampaignsCard({ args, compare }: { args: QueryArgs; compare: boolean }) {
  if (compare) {
    const [rows, exclusion] = await Promise.all([
      getCampaignContributionComparison(args, 20),
      getCampaignsExclusionCounts(args),
    ]);
    const chartRows = rows.map((r) => ({
      label: r.campaignName ?? r.campaignId,
      sublabel: r.campaignType ?? undefined,
      w_shaped: r.creditByModel.w_shaped,
      first_touch: r.creditByModel.first_touch,
      last_touch: r.creditByModel.last_touch,
    }));
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top {rows.length} campaigns · all models</CardTitle>
          <CardDescription>
            Each campaign shows credit under linear, first-touch, and last-touch simultaneously.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-6 py-2">
            {rows.length === 0 ? <EmptyState /> : <ComparisonChart data={chartRows} />}
          </div>
          <ExcludedReasons total={exclusion.total} included={exclusion.included} reasons={exclusion.reasons} />
        </CardContent>
      </Card>
    );
  }

  const [rows, exclusion] = await Promise.all([
    getCampaignContributionToSqls(args, 20),
    getCampaignsExclusionCounts(args),
  ]);
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Top {rows.length} campaigns</CardTitle>
          <CardDescription>
            Source: <code>mart.attribution_contact</code> · model <strong>{args.model.replace("_", "-")}</strong>
          </CardDescription>
        </div>
        <ExportCsvButton chart="campaigns-top" />
      </CardHeader>
      <CardContent className="p-0">
        <div className="px-6 py-2">
          {rows.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="hidden md:block">
                <CampaignBarChart data={rows} />
              </div>
              <div className="md:hidden">
                <MobileTopList
                  title="Top campaigns by credit"
                  items={rows.slice(0, 10).map((r) => ({
                    label: r.campaignName ?? r.campaignId,
                    sublabel: r.campaignType ?? undefined,
                    value: r.totalCredit.toFixed(2),
                  }))}
                />
              </div>
            </>
          )}
        </div>
        <ExcludedReasons total={exclusion.total} included={exclusion.included} reasons={exclusion.reasons} />
      </CardContent>
    </Card>
  );
}

async function TypeRollupCard({ args, compare }: { args: QueryArgs; compare: boolean }) {
  if (compare) {
    const rows = await getCampaignTypeRollupComparison(args);
    const chartRows = rows.map((r) => ({
      label: r.campaignType,
      w_shaped: r.creditByModel.w_shaped,
      first_touch: r.creditByModel.first_touch,
      last_touch: r.creditByModel.last_touch,
    }));
    return (
      <Card>
        <CardHeader>
          <CardTitle>Credit by campaign type · all models</CardTitle>
          <CardDescription>Same data, three models side by side.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? <EmptyState /> : <ComparisonChart data={chartRows} />}
        </CardContent>
      </Card>
    );
  }

  const rows = await getCampaignTypeRollup(args);
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Credit by campaign type</CardTitle>
          <CardDescription>Same model and date range, rolled up by campaign type.</CardDescription>
        </div>
        <ExportCsvButton chart="campaigns-type" />
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="hidden md:block">
              <CampaignTypeChart data={rows} />
            </div>
            <div className="md:hidden">
              <MobileTopList
                title="By campaign type"
                items={rows.map((r) => ({
                  label: r.campaignType,
                  sublabel: `${r.campaignCount} campaign${r.campaignCount === 1 ? "" : "s"}`,
                  value: r.totalCredit.toFixed(2),
                }))}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

async function ConversionRateCard({ args }: { args: QueryArgs }) {
  const rows = await getConversionRateTable(args, 50);
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Engagement → SQL conversion rate</CardTitle>
          <CardDescription>
            Distinct contacts touched by the campaign vs. those who later became SQL within the
            current filter window. Click column headers to re-sort.
          </CardDescription>
        </div>
        <ExportCsvButton chart="campaigns-conversion" />
      </CardHeader>
      <CardContent className="p-0">
        <ConversionRateTable data={rows} />
      </CardContent>
    </Card>
  );
}

function FilterBarSkeleton() {
  return <div className="h-9 animate-pulse rounded-md border bg-(--color-surface)" />;
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
      return "First-touch credit (1.0 to the earliest in-window touchpoint).";
    case "last_touch":
      return "Last-touch credit (1.0 to the latest in-window touchpoint).";
    case "w_shaped":
    default:
      return "W-shaped multi-touch credit (1 absolute point per qualifying touchpoint).";
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
