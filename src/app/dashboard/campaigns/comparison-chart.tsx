"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";

const ReactECharts = dynamic(() => import("echarts-for-react").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] items-center justify-center rounded-md border bg-(--color-surface) text-sm text-(--color-text-muted)">
      Loading chart…
    </div>
  ),
});

export interface ComparisonRow {
  label: string;
  sublabel?: string;
  linear: number;
  first_touch: number;
  last_touch: number;
}

interface Props {
  data: ComparisonRow[];
  /** "credit" → decimals; "currency" → USD formatted */
  valueFormat?: "credit" | "currency";
}

const usdFmt = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatValue(v: number, fmt: "credit" | "currency") {
  return fmt === "currency" ? usdFmt.format(v) : v.toFixed(2);
}

export function ComparisonChart({ data, valueFormat = "credit" }: Props) {
  const option = useMemo<EChartsOption>(() => {
    const sorted = [...data].sort((a, b) => a.linear - b.linear);
    const labels = sorted.map((r) => r.label);

    const seriesColors = {
      linear: "#1f6feb",
      first_touch: "#9a6700",
      last_touch: "#cf222e",
    };

    return {
      grid: { left: 24, right: 24, top: 36, bottom: 32, containLabel: true },
      legend: {
        data: ["Linear", "First touch", "Last touch"],
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
          const row = sorted[idx];
          return `<strong>${row.label}</strong>` +
            (row.sublabel ? `<br/><span style="color:#5b6573">${row.sublabel}</span>` : "") +
            `<br/>Linear: ${formatValue(row.linear, valueFormat)}` +
            `<br/>First touch: ${formatValue(row.first_touch, valueFormat)}` +
            `<br/>Last touch: ${formatValue(row.last_touch, valueFormat)}`;
        },
      },
      xAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#e4e6ea" } },
        axisLabel: {
          formatter: (v: number) => formatValue(v, valueFormat),
        },
      },
      yAxis: {
        type: "category",
        data: labels,
        axisLabel: { width: 200, overflow: "truncate" },
      },
      series: [
        {
          name: "Linear",
          type: "bar",
          data: sorted.map((r) => r.linear),
          itemStyle: { color: seriesColors.linear, borderRadius: [0, 3, 3, 0] },
          barMaxWidth: 12,
        },
        {
          name: "First touch",
          type: "bar",
          data: sorted.map((r) => r.first_touch),
          itemStyle: { color: seriesColors.first_touch, borderRadius: [0, 3, 3, 0] },
          barMaxWidth: 12,
        },
        {
          name: "Last touch",
          type: "bar",
          data: sorted.map((r) => r.last_touch),
          itemStyle: { color: seriesColors.last_touch, borderRadius: [0, 3, 3, 0] },
          barMaxWidth: 12,
        },
      ],
    };
  }, [data, valueFormat]);

  return (
    <ReactECharts
      option={option}
      style={{ height: Math.max(420, data.length * 46 + 80), width: "100%" }}
      opts={{ renderer: "canvas" }}
    />
  );
}
