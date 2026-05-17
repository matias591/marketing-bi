import { type NextRequest, NextResponse } from "next/server";
import { parseFilters, parseTypeFilter, resolveDateRange } from "@/lib/dashboard-filters";
import {
  getCampaignContributionToSqls,
  getCampaignContributionComparison,
  getCampaignTypeRollup,
  getCampaignTypeRollupComparison,
  getCampaignsExclusionCounts,
  getConversionRateTable,
} from "@/app/dashboard/campaigns/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const raw: Record<string, string> = {};
    sp.forEach((v, k) => { raw[k] = v; });

    const filters = parseFilters(raw);
    const dateRange = resolveDateRange(filters);
    const types = parseTypeFilter(filters.types);
    const compare = filters.compare === "1";

    const args = {
      model: filters.model,
      fromDate: dateRange.from,
      toDate: dateRange.to,
      campaignTypes: types,
    };

    if (compare) {
      const [topCampaigns, typeRollup, exclusion] = await Promise.all([
        getCampaignContributionComparison(args, 20),
        getCampaignTypeRollupComparison(args),
        getCampaignsExclusionCounts(args),
      ]);
      return NextResponse.json({ compare: true, topCampaigns, typeRollup, exclusion });
    }

    const [topCampaigns, typeRollup, exclusion, conversionTable] = await Promise.all([
      getCampaignContributionToSqls(args, 20),
      getCampaignTypeRollup(args),
      getCampaignsExclusionCounts(args),
      getConversionRateTable(args, 50),
    ]);
    return NextResponse.json({ compare: false, topCampaigns, typeRollup, exclusion, conversionTable });
  } catch (err) {
    console.error("[api/dashboard/campaigns]", err);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
