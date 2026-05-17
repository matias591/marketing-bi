"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExcludedReasons } from "@/components/dashboard/excluded-reasons";
import { ExportCsvButton } from "@/components/dashboard/export-csv-button";
import { MobileTopList } from "@/components/dashboard/mobile-top-list";
import { CampaignBarChart } from "./campaign-bar-chart";
import { CampaignTypeChart } from "./campaign-type-chart";
import { ConversionRateTable } from "./conversion-rate-table";
import { ComparisonChart } from "./comparison-chart";

// ---------- response shape types (mirror query.ts interfaces) ----------

interface Exclusion {
  total: number;
  included: number;
  reasons: Array<{ label: string; count: number; detail?: string }>;
}

interface SingleCampaignRow {
  campaignId: string;
  campaignName: string | null;
  campaignType: string | null;
  sqlContacts: number;
  totalCredit: number;
}

interface CompareCampaignRow {
  campaignId: string;
  campaignName: string | null;
  campaignType: string | null;
  creditByModel: { w_shaped: number; first_touch: number; last_touch: number };
}

interface SingleTypeRow {
  campaignType: string;
  totalCredit: number;
  sqlContacts: number;
  campaignCount: number;
}

interface CompareTypeRow {
  campaignType: string;
  creditByModel: { w_shaped: number; first_touch: number; last_touch: number };
}

interface ConversionRow {
  campaignId: string;
  campaignName: string | null;
  campaignType: string | null;
  engagedContacts: number;
  sqlContributors: number;
  conversionRate: number;
}

type ApiData =
  | {
      compare: false;
      topCampaigns: SingleCampaignRow[];
      typeRollup: SingleTypeRow[];
      exclusion: Exclusion;
      conversionTable: ConversionRow[];
    }
  | {
      compare: true;
      topCampaigns: CompareCampaignRow[];
      typeRollup: CompareTypeRow[];
      exclusion: Exclusion;
    };

// ---------- inner component (needs Suspense because of useSearchParams) ----------

function Inner() {
  const sp = useSearchParams();
  const paramStr = sp.toString();

  const { data, isFetching } = useQuery<ApiData>({
    queryKey: ["campaigns", paramStr],
    queryFn: () =>
      fetch(`/api/dashboard/campaigns?${paramStr}`).then((r) => {
        if (!r.ok) throw new Error("campaigns fetch failed");
        return r.json();
      }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  if (!data) {
    return (
      <>
        <ChartSkeleton title="Top campaigns" />
        <ChartSkeleton title="Credit by campaign type" />
        <ChartSkeleton title="Engagement → SQL conversion rate" />
      </>
    );
  }

  const { compare, topCampaigns, typeRollup, exclusion } = data;

  return (
    <div
      className={`flex flex-col gap-5 transition-opacity duration-200 ${isFetching ? "opacity-60" : "opacity-100"}`}
    >
      {/* ── Top campaigns card ── */}
      {compare ? (
        <Card>
          <CardHeader>
            <CardTitle>Top {topCampaigns.length} campaigns · all models</CardTitle>
            <CardDescription>
              Each campaign shows credit under linear, first-touch, and last-touch simultaneously.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-6 py-2">
              {topCampaigns.length === 0 ? (
                <EmptyState />
              ) : (
                <ComparisonChart
                  data={(topCampaigns as CompareCampaignRow[]).map((r) => ({
                    label: r.campaignName ?? r.campaignId,
                    sublabel: r.campaignType ?? undefined,
                    w_shaped: r.creditByModel.w_shaped,
                    first_touch: r.creditByModel.first_touch,
                    last_touch: r.creditByModel.last_touch,
                  }))}
                />
              )}
            </div>
            <ExcludedReasons
              total={exclusion.total}
              included={exclusion.included}
              reasons={exclusion.reasons}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Top {topCampaigns.length} campaigns</CardTitle>
              <CardDescription>
                Source: <code>mart.attribution_contact</code>
              </CardDescription>
            </div>
            <ExportCsvButton chart="campaigns-top" />
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-6 py-2">
              {topCampaigns.length === 0 ? (
                <EmptyState />
              ) : (
                <>
                  <div className="hidden md:block">
                    <CampaignBarChart data={topCampaigns as SingleCampaignRow[]} />
                  </div>
                  <div className="md:hidden">
                    <MobileTopList
                      title="Top campaigns by credit"
                      items={(topCampaigns as SingleCampaignRow[]).slice(0, 10).map((r) => ({
                        label: r.campaignName ?? r.campaignId,
                        sublabel: r.campaignType ?? undefined,
                        value: r.totalCredit.toFixed(2),
                      }))}
                    />
                  </div>
                </>
              )}
            </div>
            <ExcludedReasons
              total={exclusion.total}
              included={exclusion.included}
              reasons={exclusion.reasons}
            />
          </CardContent>
        </Card>
      )}

      {/* ── Type rollup card ── */}
      {compare ? (
        <Card>
          <CardHeader>
            <CardTitle>Credit by campaign type · all models</CardTitle>
            <CardDescription>Same data, three models side by side.</CardDescription>
          </CardHeader>
          <CardContent>
            {typeRollup.length === 0 ? (
              <EmptyState />
            ) : (
              <ComparisonChart
                data={(typeRollup as CompareTypeRow[]).map((r) => ({
                  label: r.campaignType,
                  w_shaped: r.creditByModel.w_shaped,
                  first_touch: r.creditByModel.first_touch,
                  last_touch: r.creditByModel.last_touch,
                }))}
              />
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Credit by campaign type</CardTitle>
              <CardDescription>Same model and date range, rolled up by campaign type.</CardDescription>
            </div>
            <ExportCsvButton chart="campaigns-type" />
          </CardHeader>
          <CardContent>
            {typeRollup.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                <div className="hidden md:block">
                  <CampaignTypeChart data={typeRollup as SingleTypeRow[]} />
                </div>
                <div className="md:hidden">
                  <MobileTopList
                    title="By campaign type"
                    items={(typeRollup as SingleTypeRow[]).map((r) => ({
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
      )}

      {/* ── Conversion rate table (single-model only) ── */}
      {!compare && (
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
            <ConversionRateTable data={data.conversionTable} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Wrap Inner in Suspense — required by Next.js for components using useSearchParams.
export function CampaignDataSections() {
  return (
    <Suspense
      fallback={
        <>
          <ChartSkeleton title="Top campaigns" />
          <ChartSkeleton title="Credit by campaign type" />
          <ChartSkeleton title="Engagement → SQL conversion rate" />
        </>
      }
    >
      <Inner />
    </Suspense>
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
      <p className="text-sm font-medium">No campaigns match.</p>
      <p className="max-w-sm text-xs text-(--color-text-muted)">
        Try widening the date range, removing type filters, or switching the attribution model.
      </p>
    </div>
  );
}
