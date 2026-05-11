"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import type { DepthBucket } from "./query";

const ReactECharts = dynamic(() => import("echarts-for-react").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex h-[360px] items-center justify-center rounded-md border bg-(--color-surface) text-sm text-(--color-text-muted)">
      Loading chart…
    </div>
  ),
});

export function DepthHistogram({ buckets }: { buckets: DepthBucket[] }) {
  const option = useMemo<EChartsOption>(() => {
    return {
      grid: { left: 24, right: 24, top: 36, bottom: 40, containLabel: true },
      legend: {
        data: ["To SQL", "To Customer"],
        top: 4,
        right: 8,
        textStyle: { fontSize: 11, color: "#5b6573" },
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 12,
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: unknown) => {
          const arr = Array.isArray(params) ? params : [params];
          const idx = (arr[0] as { dataIndex: number }).dataIndex;
          const b = buckets[idx];
          return `<strong>${b.label} touchpoints</strong><br/>` +
            `To SQL: ${b.sql} contacts<br/>` +
            `To Customer: ${b.customer} contacts`;
        },
      },
      xAxis: {
        type: "category",
        data: buckets.map((b) => b.label),
        name: "Touchpoints in 90-day pre-transition window",
        nameLocation: "middle",
        nameGap: 26,
        axisLine: { lineStyle: { color: "#e4e6ea" } },
      },
      yAxis: {
        type: "value",
        name: "Contacts",
        nameLocation: "middle",
        nameGap: 36,
        splitLine: { lineStyle: { color: "#e4e6ea" } },
      },
      series: [
        {
          name: "To SQL",
          type: "bar",
          data: buckets.map((b) => b.sql),
          itemStyle: { color: "#1f6feb", borderRadius: [3, 3, 0, 0] },
          barMaxWidth: 24,
        },
        {
          name: "To Customer",
          type: "bar",
          data: buckets.map((b) => b.customer),
          itemStyle: { color: "#1a7f37", borderRadius: [3, 3, 0, 0] },
          barMaxWidth: 24,
        },
      ],
    };
  }, [buckets]);

  return (
    <ReactECharts
      option={option}
      style={{ height: 360, width: "100%" }}
      opts={{ renderer: "canvas" }}
    />
  );
}
