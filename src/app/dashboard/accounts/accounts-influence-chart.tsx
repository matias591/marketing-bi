"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import type { AccountsInfluencedRow } from "./query";

const ReactECharts = dynamic(() => import("echarts-for-react").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex h-[320px] items-center justify-center rounded-md border bg-(--color-surface) text-sm text-(--color-text-muted)">
      Loading chart…
    </div>
  ),
});

export function AccountsInfluenceChart({ data }: { data: AccountsInfluencedRow[] }) {
  const option = useMemo<EChartsOption>(() => {
    const sorted = [...data].sort((a, b) => a.influencedAccounts - b.influencedAccounts);
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
            `Influenced accounts: ${row.influencedAccounts}` +
            (row.campaignType ? `<br/>Type: ${row.campaignType}` : "");
        },
      },
      xAxis: { type: "value", name: "Distinct influenced accounts", nameLocation: "middle", nameGap: 24, splitLine: { lineStyle: { color: "#e4e6ea" } } },
      yAxis: { type: "category", data: sorted.map((r) => r.campaignName ?? r.campaignId), axisLabel: { width: 220, overflow: "truncate" } },
      series: [
        {
          type: "bar",
          data: sorted.map((r) => r.influencedAccounts),
          itemStyle: { color: "#6f42c1", borderRadius: [0, 3, 3, 0] },
          barMaxWidth: 18,
          label: { show: true, position: "right", color: "#5b6573", fontSize: 11 },
        },
      ],
    };
  }, [data]);

  return (
    <ReactECharts
      option={option}
      style={{ height: Math.max(320, data.length * 28 + 80), width: "100%" }}
      opts={{ renderer: "canvas" }}
    />
  );
}
