/**
 * Universal CSV export endpoint (DASH-11).
 *
 *   GET /api/export/csv?chart=<name>&<filter params>
 *
 * `chart` dispatches to one of the existing dashboard queries; the same
 * filter searchParams the dashboard pages use are accepted here (model,
 * preset, from, to, types). The handler streams a CSV with a sensible
 * filename header so the browser downloads it.
 *
 * Auth: requires an authenticated user (same as the dashboards). Service
 * role is not used — RLS allows authenticated reads.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseFilters, parseTypeFilter, resolveDateRange } from "@/lib/dashboard-filters";
import {
  getCampaignContributionToSqls,
  getCampaignTypeRollup,
  getConversionRateTable,
} from "@/app/dashboard/campaigns/query";
import {
  getRevenueByCampaign,
  getRevenueByCampaignType,
} from "@/app/dashboard/revenue/query";
import {
  getAccountLeaderboard,
  getCampaignsInfluencingAccounts,
} from "@/app/dashboard/accounts/query";
import { getTouchpointDepth } from "@/app/dashboard/depth/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChartName =
  | "campaigns-top"
  | "campaigns-type"
  | "campaigns-conversion"
  | "revenue-campaigns"
  | "revenue-types"
  | "accounts-leaderboard"
  | "accounts-influence"
  | "depth";

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(row.map(csvEscape).join(","));
  return lines.join("\n");
}

export async function GET(request: NextRequest) {
  // Auth gate — same as dashboards.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const chart = url.searchParams.get("chart") as ChartName | null;
  if (!chart) {
    return NextResponse.json({ error: "missing ?chart param" }, { status: 400 });
  }

  // Reuse the same filter parsing as the pages.
  const flat: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { flat[k] = v; });
  const filters = parseFilters(flat);
  const dateRange = resolveDateRange(filters);
  const types = parseTypeFilter(filters.types);

  const queryArgs = {
    model: filters.model,
    fromDate: dateRange.from,
    toDate: dateRange.to,
    campaignTypes: types,
  };

  let csv: string;
  let filename: string;

  switch (chart) {
    case "campaigns-top": {
      const rows = await getCampaignContributionToSqls(queryArgs, 200);
      csv = toCsv(
        ["campaign_id", "campaign_name", "campaign_type", "sql_contacts", "total_credit"],
        rows.map((r) => [r.campaignId, r.campaignName, r.campaignType, r.sqlContacts, r.totalCredit.toFixed(4)]),
      );
      filename = "campaigns-top.csv";
      break;
    }
    case "campaigns-type": {
      const rows = await getCampaignTypeRollup(queryArgs);
      csv = toCsv(
        ["campaign_type", "total_credit", "sql_contacts", "campaign_count"],
        rows.map((r) => [r.campaignType, r.totalCredit.toFixed(4), r.sqlContacts, r.campaignCount]),
      );
      filename = "campaigns-by-type.csv";
      break;
    }
    case "campaigns-conversion": {
      const rows = await getConversionRateTable(queryArgs, 500);
      csv = toCsv(
        ["campaign_id", "campaign_name", "campaign_type", "engaged_contacts", "sql_contributors", "conversion_rate"],
        rows.map((r) => [r.campaignId, r.campaignName, r.campaignType, r.engagedContacts, r.sqlContributors, r.conversionRate.toFixed(6)]),
      );
      filename = "campaigns-conversion-rate.csv";
      break;
    }
    case "revenue-campaigns": {
      const rows = await getRevenueByCampaign(queryArgs, 200);
      csv = toCsv(
        ["campaign_id", "campaign_name", "campaign_type", "revenue_usd", "influenced_opps", "influenced_accounts"],
        rows.map((r) => [r.campaignId, r.campaignName, r.campaignType, r.revenue.toFixed(2), r.influencedOpps, r.influencedAccounts]),
      );
      filename = "revenue-by-campaign.csv";
      break;
    }
    case "revenue-types": {
      const rows = await getRevenueByCampaignType(queryArgs);
      csv = toCsv(
        ["campaign_type", "revenue_usd", "pct_of_total", "campaign_count", "influenced_opps"],
        rows.map((r) => [r.campaignType, r.revenue.toFixed(2), r.pctOfTotal.toFixed(6), r.campaignCount, r.influencedOpps]),
      );
      filename = "revenue-by-type.csv";
      break;
    }
    case "accounts-leaderboard": {
      const rows = await getAccountLeaderboard(queryArgs, 1000);
      csv = toCsv(
        ["account_id", "account_name", "engaged_contacts", "sql_contacts", "closed_won_usd", "last_touch_at"],
        rows.map((r) => [r.accountId, r.accountName, r.engagedContacts, r.sqlContacts, r.closedWonRevenue.toFixed(2), r.lastTouchAt ?? ""]),
      );
      filename = "accounts-leaderboard.csv";
      break;
    }
    case "accounts-influence": {
      const rows = await getCampaignsInfluencingAccounts(queryArgs, 200);
      csv = toCsv(
        ["campaign_id", "campaign_name", "campaign_type", "influenced_accounts"],
        rows.map((r) => [r.campaignId, r.campaignName, r.campaignType, r.influencedAccounts]),
      );
      filename = "campaigns-influencing-accounts.csv";
      break;
    }
    case "depth": {
      const stats = await getTouchpointDepth(queryArgs);
      const rows = stats.buckets.map((b) => [b.label, b.rangeStart, b.rangeEnd ?? "", b.sql, b.customer]);
      const summary = [
        ["", "", "", "mean_sql", stats.sqlMean.toFixed(2)],
        ["", "", "", "median_sql", stats.sqlMedian.toFixed(2)],
        ["", "", "", "mean_customer", stats.customerMean.toFixed(2)],
        ["", "", "", "median_customer", stats.customerMedian.toFixed(2)],
      ];
      csv = toCsv(
        ["bucket_label", "range_start", "range_end", "to_sql_contacts", "to_customer_contacts"],
        [...rows, ...summary],
      );
      filename = "touchpoint-depth.csv";
      break;
    }
    default:
      return NextResponse.json({ error: `unknown chart: ${chart}` }, { status: 400 });
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
