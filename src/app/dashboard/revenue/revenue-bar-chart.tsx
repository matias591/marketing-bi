"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import type { RevenueByCampaignRow } from "./query";

const ReactECharts = dynamic(() => import("echarts-for-react").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] items-center justify-center rounded-md border bg-(--color-surface) text-sm text-(--color-text-muted)">
      Loading chart…
    </div>
  ),
});

const fmt = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function RevenueBarChart({ data }: { data: RevenueByCampaignRow[] }) {
  const option = useMemo<EChartsOption>(() => {
    const sorted = [...data].sort((a, b) => a.revenue - b.revenue);
    return {
      grid: { left: 24, right: 32, top: 24, bottom: 32, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: unknown) => {
          const arr = Array.isArray(params) ? params : [params];
          const item = arr[0] as { dataIndex: number };
          const row = sorted[item.dataIndex];
          return `<strong>${row.campaignName ?? row.campaignId}</strong><br/>` +
            `Revenue: ${fmt.format(row.revenue)}<br/>` +
            `Influenced opps: ${row.influencedOpps}<br/>` +
            `Influenced accounts: ${row.influencedAccounts}<br/>` +
            (row.campaignType ? `Type: ${row.campaignType}` : "");
        },
      },
      xAxis: {
        type: "value",
        name: "Attributed revenue (USD)",
        nameLocation: "middle",
        nameGap: 24,
        splitLine: { lineStyle: { color: "#e4e6ea" } },
        axisLabel: { formatter: (v: number) => fmt.format(v) },
      },
      yAxis: {
        type: "category",
        data: sorted.map((r) => r.campaignName ?? r.campaignId),
        axisLabel: { width: 220, overflow: "truncate" },
      },
      series: [
        {
          type: "bar",
          data: sorted.map((r) => r.revenue),
          itemStyle: { color: "#0f7b3a", borderRadius: [0, 3, 3, 0] },
          barMaxWidth: 18,
          label: {
            show: true,
            position: "right",
            color: "#5b6573",
            fontSize: 11,
            formatter: (p) => (typeof p.value === "number" ? fmt.format(p.value) : String(p.value)),
          },
        },
      ],
    };
  }, [data]);

  return (
    <ReactECharts
      option={option}
      style={{ height: Math.max(420, data.length * 28 + 80), width: "100%" }}
      opts={{ renderer: "canvas" }}
    />
  );
}
