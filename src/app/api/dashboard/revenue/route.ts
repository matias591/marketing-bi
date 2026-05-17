import { type NextRequest, NextResponse } from "next/server";
import { parseFilters, parseTypeFilter, resolveDateRange } from "@/lib/dashboard-filters";
import {
  getRevenueHeadline,
  getRevenueByCampaign,
  getRevenueByCampaignComparison,
  getRevenueByCampaignType,
  getRevenueByCampaignTypeComparison,
  getRevenueExclusionCounts,
} from "@/app/dashboard/revenue/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const raw: Record<string, string> = {};
    sp.forEach((v, k) => { raw[k] = v; });

    const filters = parseFilters({ preset: "ytd", ...raw });
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
      const [headline, byCampaign, byType, exclusion] = await Promise.all([
        getRevenueHeadline(args),
        getRevenueByCampaignComparison(args, 20),
        getRevenueByCampaignTypeComparison(args),
        getRevenueExclusionCounts(args),
      ]);
      return NextResponse.json({ compare: true, headline, byCampaign, byType, exclusion });
    }

    const [headline, byCampaign, byType, exclusion] = await Promise.all([
      getRevenueHeadline(args),
      getRevenueByCampaign(args, 20),
      getRevenueByCampaignType(args),
      getRevenueExclusionCounts(args),
    ]);
    return NextResponse.json({ compare: false, headline, byCampaign, byType, exclusion });
  } catch (err) {
    console.error("[api/dashboard/revenue]", err);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
