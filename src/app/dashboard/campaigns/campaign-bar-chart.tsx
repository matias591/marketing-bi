"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import type { CampaignContributionRow } from "./query";

// ECharts is a heavy import; load only on the client and skip SSR.
const ReactECharts = dynamic(() => import("echarts-for-react").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] items-center justify-center rounded-md border bg-(--color-surface) text-sm text-(--color-text-muted)">
      Loading chart…
    </div>
  ),
});

export function CampaignBarChart({ data }: { data: CampaignContributionRow[] }) {
  const option = useMemo<EChartsOption>(() => {
    const sorted = [...data].sort((a, b) => a.sqlContacts - b.sqlContacts);
    return {
      grid: { left: 24, right: 24, top: 24, bottom: 32, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: unknown) => {
          const arr = Array.isArray(params) ? params : [params];
          const item = arr[0] as { data: number; name: string };
          return `<strong>${item.name}</strong><br/>${item.data} SQL contacts`;
        },
      },
      xAxis: {
        type: "value",
        name: "SQL contacts",
        nameLocation: "middle",
        nameGap: 24,
        splitLine: { lineStyle: { color: "#e4e6ea" } },
      },
      yAxis: {
        type: "category",
        data: sorted.map((r) => r.campaignName ?? r.campaignId),
        axisLabel: { width: 220, overflow: "truncate" },
      },
      series: [
        {
          type: "bar",
          data: sorted.map((r) => r.sqlContacts),
          itemStyle: { color: "#1f6feb", borderRadius: [0, 3, 3, 0] },
          barMaxWidth: 18,
          label: { show: true, position: "right", color: "#5b6573", fontSize: 11 },
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
