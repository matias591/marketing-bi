"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExcludedReasons } from "@/components/dashboard/excluded-reasons";
import { ExportCsvButton } from "@/components/dashboard/export-csv-button";
import { MobileTopList } from "@/components/dashboard/mobile-top-list";
import { ComparisonChart } from "../campaigns/comparison-chart";
import { RevenueBarChart } from "./revenue-bar-chart";
import { RevenueTypeChart } from "./revenue-type-chart";

const fmtUsd = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

// ---------- response shape types ----------

interface Exclusion {
  total: number;
  included: number;
  reasons: Array<{ label: string; count: number; detail?: string }>;
}

interface Headline {
  totalRevenue: number;
  influencedOpps: number;
  influencedAccounts: number;
  influencedContacts: number;
}

interface SingleCampaignRow {
  campaignId: string;
  campaignName: string | null;
  campaignType: string | null;
  revenue: number;
  influencedOpps: number;
  influencedAccounts: number;
}

interface CompareCampaignRow {
  campaignId: string;
  campaignName: string | null;
  campaignType: string | null;
  revenueByModel: { w_shaped: number; first_touch: number; last_touch: number };
}

interface SingleTypeRow {
  campaignType: string;
  revenue: number;
  pctOfTotal: number;
  campaignCount: number;
  influencedOpps: number;
}

interface CompareTypeRow {
  campaignType: string;
  revenueByModel: { w_shaped: number; first_touch: number; last_touch: number };
}

type ApiData =
  | {
      compare: false;
      headline: Headline;
      byCampaign: SingleCampaignRow[];
      byType: SingleTypeRow[];
      exclusion: Exclusion;
    }
  | {
      compare: true;
      headline: Headline;
      byCampaign: CompareCampaignRow[];
      byType: CompareTypeRow[];
      exclusion: Exclusion;
    };

function Inner() {
  const sp = useSearchParams();
  const paramStr = sp.toString();

  const { data, isFetching } = useQuery<ApiData>({
    queryKey: ["revenue", paramStr],
    queryFn: () =>
      fetch(`/api/dashboard/revenue?${paramStr}`).then((r) => {
        if (!r.ok) throw new Error("revenue fetch failed");
        return r.json();
      }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  if (!data) {
    return (
      <>
        <HeadlineSkeleton />
        <ChartSkeleton title="Top campaigns by revenue" />
        <ChartSkeleton title="Revenue by campaign type" />
      </>
    );
  }

  const { compare, headline, byCampaign, byType, exclusion } = data;

  return (
    <div
      className={`flex flex-col gap-5 transition-opacity duration-200 ${isFetching ? "opacity-60" : "opacity-100"}`}
    >
      {/* ── Headline KPIs ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Attributed revenue" value={fmtUsd.format(headline.totalRevenue)} />
        <Kpi label="Closed Won opps" value={headline.influencedOpps.toLocaleString()} />
        <Kpi label="Influenced accounts" value={headline.influencedAccounts.toLocaleString()} />
        <Kpi label="Influenced contacts" value={headline.influencedContacts.toLocaleString()} />
      </div>

      {/* ── Revenue by campaign ── */}
      {compare ? (
        <Card>
          <CardHeader>
            <CardTitle>Top {byCampaign.length} campaigns by revenue · all models</CardTitle>
            <CardDescription>Revenue under W-shaped, first-touch, and last-touch side by side.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-6 py-2">
              {byCampaign.length === 0 ? (
                <EmptyState />
              ) : (
                <ComparisonChart
                  data={(byCampaign as CompareCampaignRow[]).map((r) => ({
                    label: r.campaignName ?? r.campaignId,
                    sublabel: r.campaignType ?? undefined,
                    w_shaped: r.revenueByModel.w_shaped,
                    first_touch: r.revenueByModel.first_touch,
                    last_touch: r.revenueByModel.last_touch,
                  }))}
                  valueFormat="currency"
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
              <CardTitle>Top {byCampaign.length} campaigns by revenue</CardTitle>
              <CardDescription>
                Source: <code>mart.opportunity_credit</code>
              </CardDescription>
            </div>
            <ExportCsvButton chart="revenue-campaigns" />
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-6 py-2">
              {byCampaign.length === 0 ? (
                <EmptyState />
              ) : (
                <>
                  <div className="hidden md:block">
                    <RevenueBarChart data={byCampaign as SingleCampaignRow[]} />
                  </div>
                  <div className="md:hidden">
                    <MobileTopList
                      title="Top campaigns by attributed revenue"
                      items={(byCampaign as SingleCampaignRow[]).slice(0, 10).map((r) => ({
                        label: r.campaignName ?? r.campaignId,
                        sublabel: r.campaignType ?? undefined,
                        value: fmtUsd.format(r.revenue),
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

      {/* ── Revenue by type ── */}
      {compare ? (
        <Card>
          <CardHeader>
            <CardTitle>Revenue by campaign type · all models</CardTitle>
            <CardDescription>Same data, three models side by side.</CardDescription>
          </CardHeader>
          <CardContent>
            {byType.length === 0 ? (
              <EmptyState />
            ) : (
              <ComparisonChart
                data={(byType as CompareTypeRow[]).map((r) => ({
                  label: r.campaignType,
                  w_shaped: r.revenueByModel.w_shaped,
                  first_touch: r.revenueByModel.first_touch,
                  last_touch: r.revenueByModel.last_touch,
                }))}
                valueFormat="currency"
              />
            )}
          </CardContent>
        </Card>
      ) : (
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
            {byType.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                <div className="hidden md:block">
                  <RevenueTypeChart data={byType as SingleTypeRow[]} />
                </div>
                <div className="md:hidden">
                  <MobileTopList
                    title="Revenue by type"
                    items={(byType as SingleTypeRow[]).map((r) => ({
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
      )}
    </div>
  );
}

export function RevenueDataSections() {
  return (
    <Suspense
      fallback={
        <>
          <HeadlineSkeleton />
          <ChartSkeleton title="Top campaigns by revenue" />
          <ChartSkeleton title="Revenue by campaign type" />
        </>
      }
    >
      <Inner />
    </Suspense>
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

function HeadlineSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-14 animate-pulse rounded-md border bg-(--color-surface)" />
      ))}
    </div>
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
      <p className="text-sm font-medium">No revenue attributed.</p>
      <p className="max-w-sm text-xs text-(--color-text-muted)">
        Either no Closed Won opportunities closed in this range, or none of the OCR contacts on
        those Opps have customer-stage attribution touchpoints. Try widening the date range or
        switching the model.
      </p>
    </div>
  );
}
