"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import type { RevenueByTypeRow } from "./query";

const ReactECharts = dynamic(() => import("echarts-for-react").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex h-[280px] items-center justify-center rounded-md border bg-(--color-surface) text-sm text-(--color-text-muted)">
      Loading chart…
    </div>
  ),
});

const fmt = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function RevenueTypeChart({ data }: { data: RevenueByTypeRow[] }) {
  const option = useMemo<EChartsOption>(() => {
    const sorted = [...data].sort((a, b) => a.revenue - b.revenue);
    return {
      grid: { left: 24, right: 80, top: 24, bottom: 32, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: unknown) => {
          const arr = Array.isArray(params) ? params : [params];
          const item = arr[0] as { dataIndex: number };
          const row = sorted[item.dataIndex];
          return `<strong>${row.campaignType}</strong><br/>` +
            `Revenue: ${fmt.format(row.revenue)} (${(row.pctOfTotal * 100).toFixed(1)}%)<br/>` +
            `Campaigns: ${row.campaignCount}<br/>` +
            `Influenced opps: ${row.influencedOpps}`;
        },
      },
      xAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#e4e6ea" } },
        axisLabel: { formatter: (v: number) => fmt.format(v) },
      },
      yAxis: {
        type: "category",
        data: sorted.map((r) => r.campaignType),
        axisLabel: { width: 200, overflow: "truncate" },
      },
      series: [
        {
          type: "bar",
          data: sorted.map((r) => r.revenue),
          itemStyle: { color: "#0f7b3a", borderRadius: [0, 3, 3, 0] },
          barMaxWidth: 22,
          label: {
            show: true,
            position: "right",
            color: "#5b6573",
            fontSize: 11,
            formatter: (p) => {
              const idx = (p as { dataIndex: number }).dataIndex;
              const row = sorted[idx];
              return `${fmt.format(row.revenue)} (${(row.pctOfTotal * 100).toFixed(0)}%)`;
            },
          },
        },
      ],
    };
  }, [data]);

  return (
    <ReactECharts
      option={option}
      style={{ height: Math.max(280, data.length * 36 + 80), width: "100%" }}
      opts={{ renderer: "canvas" }}
    />
  );
}
