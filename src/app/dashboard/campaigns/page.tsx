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
import { parseFilters, parseTypeFilter, resolveDateRange } from "@/lib/dashboard-filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
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

  const queryArgs = {
    model: filters.model,
    fromDate: dateRange.from,
    toDate: dateRange.to,
    campaignTypes: types,
  };

  const [topCampaigns, typeRollup, conversion, availableTypes] = await Promise.all([
    getCampaignContributionToSqls(queryArgs, 20),
    getCampaignTypeRollup(queryArgs),
    getConversionRateTable(queryArgs, 50),
    getAvailableCampaignTypes(),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Campaign Contribution to SQLs</h1>
        <p className="mt-1 text-sm text-(--color-text-muted)">
          {modelDescription(filters.model)} per campaign at the SQL stage. Range: <strong>{dateRange.label}</strong>.
          See <a className="underline" href="/methodology">methodology</a> for full details.
        </p>
      </header>

      <FilterBar
        model={filters.model}
        preset={filters.preset}
        types={types}
        availableTypes={availableTypes}
      />

      <Card>
        <CardHeader>
          <CardTitle>Top {topCampaigns.length} campaigns</CardTitle>
          <CardDescription>
            Source: <code>mart.attribution_contact</code> · model <strong>{filters.model.replace("_", "-")}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topCampaigns.length === 0 ? (
            <EmptyState />
          ) : (
            <CampaignBarChart data={topCampaigns} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Credit by campaign type</CardTitle>
          <CardDescription>
            Same model and date range, rolled up by campaign type.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {typeRollup.length === 0 ? (
            <EmptyState />
          ) : (
            <CampaignTypeChart data={typeRollup} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Engagement → SQL conversion rate</CardTitle>
          <CardDescription>
            Distinct contacts touched by the campaign, vs. those who later became SQL within the
            current filter window. Click column headers to re-sort.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ConversionRateTable data={conversion} />
        </CardContent>
      </Card>
    </div>
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
