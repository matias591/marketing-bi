"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import type { CampaignTypeRollupRow } from "./query";

const ReactECharts = dynamic(() => import("echarts-for-react").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex h-[280px] items-center justify-center rounded-md border bg-(--color-surface) text-sm text-(--color-text-muted)">
      Loading chart…
    </div>
  ),
});

export function CampaignTypeChart({ data }: { data: CampaignTypeRollupRow[] }) {
  const option = useMemo<EChartsOption>(() => {
    const sorted = [...data].sort((a, b) => a.totalCredit - b.totalCredit);
    return {
      grid: { left: 24, right: 32, top: 24, bottom: 32, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: unknown) => {
          const arr = Array.isArray(params) ? params : [params];
          const item = arr[0] as { dataIndex: number };
          const row = sorted[item.dataIndex];
          return `<strong>${row.campaignType}</strong><br/>` +
            `Total credit: ${row.totalCredit.toFixed(2)}<br/>` +
            `Distinct contacts: ${row.sqlContacts}<br/>` +
            `Campaigns: ${row.campaignCount}`;
        },
      },
      xAxis: { type: "value", splitLine: { lineStyle: { color: "#e4e6ea" } } },
      yAxis: {
        type: "category",
        data: sorted.map((r) => r.campaignType),
        axisLabel: { width: 200, overflow: "truncate" },
      },
      series: [
        {
          type: "bar",
          data: sorted.map((r) => r.totalCredit),
          itemStyle: { color: "#1a7f37", borderRadius: [0, 3, 3, 0] },
          barMaxWidth: 22,
          label: {
            show: true,
            position: "right",
            color: "#5b6573",
            fontSize: 11,
            formatter: (p) => (typeof p.value === "number" ? p.value.toFixed(1) : String(p.value)),
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
