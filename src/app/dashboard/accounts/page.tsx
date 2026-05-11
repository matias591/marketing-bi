import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { ExportCsvButton } from "@/components/dashboard/export-csv-button";
import { MobileTopList } from "@/components/dashboard/mobile-top-list";
import { AccountLeaderboardTable } from "./account-leaderboard";
import { AccountsInfluenceChart } from "./accounts-influence-chart";
import { getAccountLeaderboard, getCampaignsInfluencingAccounts } from "./query";
import { getAvailableCampaignTypes } from "../campaigns/query";
import { parseFilters, parseTypeFilter, resolveDateRange, type DashboardFilters } from "@/lib/dashboard-filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const metadata = { title: "Accounts · Marketing BI" };

interface QueryArgs {
  model: DashboardFilters["model"];
  fromDate: string | null;
  toDate: string | null;
  campaignTypes: string[] | null;
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  // Accounts default to YTD (most useful "what's working this year" view)
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
        <h1 className="text-xl font-semibold tracking-tight">Account-Level Attribution</h1>
        <p className="mt-1 text-sm text-(--color-text-muted)">
          Engaged accounts, their SQL/Customer counts, and the campaigns reaching the most distinct
          accounts. Revenue column uses the <strong>{filters.model.replace("_", "-")}</strong> model.
          Range: <strong>{dateRange.label}</strong>.
        </p>
      </header>

      <Suspense fallback={<FilterBarSkeleton />}>
        <FilterBarSection
          model={filters.model}
          preset={filters.preset}
          types={types}
          compare={false}
        />
      </Suspense>

      <Suspense key={`board-${filterKey}`} fallback={<TableSkeleton />}>
        <LeaderboardCard args={queryArgs} />
      </Suspense>

      <Suspense key={`infl-${filterKey}`} fallback={<ChartSkeleton title="Campaigns influencing the most accounts" />}>
        <InfluenceCard args={queryArgs} />
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

async function LeaderboardCard({ args }: { args: QueryArgs }) {
  const rows = await getAccountLeaderboard(args, 100);
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Account leaderboard · top {rows.length}</CardTitle>
          <CardDescription>
            Sortable by any column. Last-touch ignores the date filter — it answers "when did this
            account last engage at all?".
          </CardDescription>
        </div>
        <ExportCsvButton chart="accounts-leaderboard" />
      </CardHeader>
      <CardContent className="p-0">
        <AccountLeaderboardTable data={rows} />
      </CardContent>
    </Card>
  );
}

async function InfluenceCard({ args }: { args: QueryArgs }) {
  const rows = await getCampaignsInfluencingAccounts(args, 20);
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Campaigns influencing the most accounts</CardTitle>
          <CardDescription>
            Top campaigns by distinct Accounts whose contacts became SQL with the campaign in their
            attribution window.
          </CardDescription>
        </div>
        <ExportCsvButton chart="accounts-influence" />
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="hidden md:block">
              <AccountsInfluenceChart data={rows} />
            </div>
            <div className="md:hidden">
              <MobileTopList
                title="Campaigns by distinct accounts"
                items={rows.slice(0, 10).map((r) => ({
                  label: r.campaignName ?? r.campaignId,
                  sublabel: r.campaignType ?? undefined,
                  value: String(r.influencedAccounts),
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

function TableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-(--color-text-muted)">Account leaderboard</CardTitle>
        <CardDescription>Loading…</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[400px] animate-pulse rounded bg-(--color-surface-2)" />
      </CardContent>
    </Card>
  );
}

function ChartSkeleton({ title }: { title: string }) {
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
      <p className="text-sm font-medium">No campaigns match the current filters.</p>
    </div>
  );
}
