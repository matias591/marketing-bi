import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { RevenueBarChart } from "./revenue-bar-chart";
import { RevenueTypeChart } from "./revenue-type-chart";
import {
  getRevenueByCampaign,
  getRevenueByCampaignType,
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

  const queryArgs: QueryArgs = {
    model: filters.model,
    fromDate: dateRange.from,
    toDate: dateRange.to,
    campaignTypes: types,
  };
  const filterKey = JSON.stringify(queryArgs);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Revenue & Closed Won</h1>
        <p className="mt-1 text-sm text-(--color-text-muted)">
          Closed Won revenue attributed to each campaign under the{" "}
          <strong>{filters.model.replace("_", "-")}</strong> model. OCR Contacts on each Opp share
          the deal amount equally; each Contact's share is then distributed across their
          customer-stage touchpoints. Range: <strong>{dateRange.label}</strong> (close date).
        </p>
      </header>

      <Suspense fallback={<FilterBarSkeleton />}>
        <FilterBarSection model={filters.model} preset={filters.preset} types={types} />
      </Suspense>

      <Suspense key={`headline-${filterKey}`} fallback={<HeadlineSkeleton />}>
        <HeadlineRow args={queryArgs} />
      </Suspense>

      <Suspense key={`bycamp-${filterKey}`} fallback={<ChartCardSkeleton title="Top campaigns by revenue" />}>
        <RevenueByCampaignCard args={queryArgs} />
      </Suspense>

      <Suspense key={`bytype-${filterKey}`} fallback={<ChartCardSkeleton title="Revenue by campaign type" />}>
        <RevenueByTypeCard args={queryArgs} />
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
    <FilterBar model={model} preset={preset} types={types} availableTypes={availableTypes} />
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

async function RevenueByCampaignCard({ args }: { args: QueryArgs }) {
  const rows = await getRevenueByCampaign(args, 20);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top {rows.length} campaigns by revenue</CardTitle>
        <CardDescription>
          Source: <code>mart.opportunity_credit</code> · model{" "}
          <strong>{args.model.replace("_", "-")}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? <EmptyState /> : <RevenueBarChart data={rows} />}
      </CardContent>
    </Card>
  );
}

async function RevenueByTypeCard({ args }: { args: QueryArgs }) {
  const rows = await getRevenueByCampaignType(args);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenue by campaign type</CardTitle>
        <CardDescription>
          Same model and date range, rolled up by campaign type. Bars labeled with $ value and %
          of total.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? <EmptyState /> : <RevenueTypeChart data={rows} />}
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
