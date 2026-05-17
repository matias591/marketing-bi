import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { ExcludedReasons } from "@/components/dashboard/excluded-reasons";
import { ExportCsvButton } from "@/components/dashboard/export-csv-button";
import { MobileTopList } from "@/components/dashboard/mobile-top-list";
import { ComparisonChart } from "../campaigns/comparison-chart";
import { RevenueBarChart } from "./revenue-bar-chart";
import { RevenueTypeChart } from "./revenue-type-chart";
import {
  getRevenueByCampaign,
  getRevenueByCampaignComparison,
  getRevenueByCampaignType,
  getRevenueByCampaignTypeComparison,
  getRevenueExclusionCounts,
  getRevenueHeadline,
} from "./query";
import { getAvailableCampaignTypes } from "../campaigns/query";
import { parseFilters, parseTypeFilter, resolveDateRange, type DashboardFilters } from "@/lib/dashboard-filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const metadata = { title: "Revenue · Marketing BI" };

interface QueryArgs {
  model: DashboardFilters["model"];
  fromDate: string | null;
  toDate: string | null;
  campaignTypes: string[] | null;
}

const fmtUsd = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  // Revenue page defaults to a wider window than campaigns since deals close
  // less frequently than SQLs. Override the default preset.
  const filters = parseFilters({ preset: "ytd", ...raw });
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
        <h1 className="text-xl font-semibold tracking-tight">Revenue & Closed Won</h1>
        <p className="mt-1 text-sm text-(--color-text-muted)">
          {compare
            ? "Closed Won revenue attributed under all three models side-by-side."
            : <>Closed Won revenue attributed under the <strong>{filters.model.replace("_", "-")}</strong> model.</>}{" "}
          OCR contacts share the deal amount equally; each contact's share is distributed across their
          customer-stage touchpoints. Range: <strong>{dateRange.label}</strong> (close date).
        </p>
      </header>

      <Suspense fallback={<FilterBarSkeleton />}>
        <FilterBarSection model={filters.model} preset={filters.preset} types={types} compare={compare} />
      </Suspense>

      <Suspense fallback={<HeadlineSkeleton />}>
        <HeadlineRow args={queryArgs} />
      </Suspense>

      <Suspense fallback={<ChartCardSkeleton title="Top campaigns by revenue" />}>
        <RevenueByCampaignCard args={queryArgs} compare={compare} />
      </Suspense>

      <Suspense fallback={<ChartCardSkeleton title="Revenue by campaign type" />}>
        <RevenueByTypeCard args={queryArgs} compare={compare} />
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
    <FilterBar model={model} preset={preset} types={types} availableTypes={availableTypes} compare={compare} />
  );
}

async function HeadlineRow({ args }: { args: QueryArgs }) {
  const h = await getRevenueHeadline(args);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Kpi label="Attributed revenue" value={fmtUsd.format(h.totalRevenue)} />
      <Kpi label="Closed Won opps" value={h.influencedOpps.toLocaleString()} />
      <Kpi label="Influenced accounts" value={h.influencedAccounts.toLocaleString()} />
      <Kpi label="Influenced contacts" value={h.influencedContacts.toLocaleString()} />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-(--color-surface) px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-(--color-text-muted)">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

async function RevenueByCampaignCard({ args, compare }: { args: QueryArgs; compare: boolean }) {
  if (compare) {
    const [rows, exclusion] = await Promise.all([
      getRevenueByCampaignComparison(args, 20),
      getRevenueExclusionCounts(args),
    ]);
    const chartRows = rows.map((r) => ({
      label: r.campaignName ?? r.campaignId,
      sublabel: r.campaignType ?? undefined,
      w_shaped: r.revenueByModel.w_shaped,
      first_touch: r.revenueByModel.first_touch,
      last_touch: r.revenueByModel.last_touch,
    }));
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top {rows.length} campaigns by revenue · all models</CardTitle>
          <CardDescription>Revenue under W-shaped, first-touch, and last-touch side by side.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-6 py-2">
            {rows.length === 0 ? <EmptyState /> : <ComparisonChart data={chartRows} valueFormat="currency" />}
          </div>
          <ExcludedReasons total={exclusion.total} included={exclusion.included} reasons={exclusion.reasons} />
        </CardContent>
      </Card>
    );
  }

  const [rows, exclusion] = await Promise.all([
    getRevenueByCampaign(args, 20),
    getRevenueExclusionCounts(args),
  ]);
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Top {rows.length} campaigns by revenue</CardTitle>
          <CardDescription>
            Source: <code>mart.opportunity_credit</code> · model <strong>{args.model.replace("_", "-")}</strong>
          </CardDescription>
        </div>
        <ExportCsvButton chart="revenue-campaigns" />
      </CardHeader>
      <CardContent className="p-0">
        <div className="px-6 py-2">
          {rows.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="hidden md:block">
                <RevenueBarChart data={rows} />
              </div>
              <div className="md:hidden">
                <MobileTopList
                  title="Top campaigns by attributed revenue"
                  items={rows.slice(0, 10).map((r) => ({
                    label: r.campaignName ?? r.campaignId,
                    sublabel: r.campaignType ?? undefined,
                    value: fmtUsd.format(r.revenue),
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

async function RevenueByTypeCard({ args, compare }: { args: QueryArgs; compare: boolean }) {
  if (compare) {
    const rows = await getRevenueByCampaignTypeComparison(args);
    const chartRows = rows.map((r) => ({
      label: r.campaignType,
      w_shaped: r.revenueByModel.w_shaped,
      first_touch: r.revenueByModel.first_touch,
      last_touch: r.revenueByModel.last_touch,
    }));
    return (
      <Card>
        <CardHeader>
          <CardTitle>Revenue by campaign type · all models</CardTitle>
          <CardDescription>Same data, three models side by side.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? <EmptyState /> : <ComparisonChart data={chartRows} valueFormat="currency" />}
        </CardContent>
      </Card>
    );
  }

  const rows = await getRevenueByCampaignType(args);
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Revenue by campaign type</CardTitle>
          <CardDescription>
            Same model and date range, rolled up by campaign type. Bars labeled with $ value and %
            of total.
          </CardDescription>
        </div>
        <ExportCsvButton chart="revenue-types" />
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="hidden md:block">
              <RevenueTypeChart data={rows} />
            </div>
            <div className="md:hidden">
              <MobileTopList
                title="Revenue by type"
                items={rows.map((r) => ({
                  label: r.campaignType,
                  sublabel: `${(r.pctOfTotal * 100).toFixed(1)}% of total · ${r.campaignCount} campaign${r.campaignCount === 1 ? "" : "s"}`,
                  value: fmtUsd.format(r.revenue),
                }))}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function FilterBarSkeleton() {
  return <div className="h-9 animate-pulse rounded-md border bg-(--color-surface)" />;
}

function HeadlineSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-14 animate-pulse rounded-md border bg-(--color-surface)" />
      ))}
    </div>
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-(--color-surface) py-12 text-center">
      <p className="text-sm font-medium">No revenue attributed.</p>
      <p className="max-w-sm text-xs text-(--color-text-muted)">
        Either no Closed Won opportunities closed in this range, or none of the OCR contacts on
        those Opps have customer-stage attribution touchpoints. Try widening the date range or
        switching the model.
      </p>
    </div>
  );
}
