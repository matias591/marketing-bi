"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";
import type { FunnelStage, FunnelTrendRow } from "./query";

const ReactECharts = dynamic(() => import("echarts-for-react").then((m) => m.default), {
  ssr: false,
  loading: () => (
    <div className="flex h-[280px] items-center justify-center rounded-md border bg-(--color-surface) text-sm text-(--color-text-muted)">
      Loading chart…
    </div>
  ),
});

const STAGE_COLORS = ["#4f8ef7", "#38bdf8", "#34d399", "#a78bfa"];

export function FunnelOverview({ stages }: { stages: FunnelStage[] }) {
  const option = useMemo<EChartsOption>(() => ({
    grid: { left: 16, right: 16, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: unknown) => {
        const arr = Array.isArray(params) ? params : [params];
        const s = stages[(arr[0] as { dataIndex: number }).dataIndex];
        const convLine = s.conversionFromPrev != null
          ? `<br/>${(s.conversionFromPrev * 100).toFixed(1)}% from previous stage`
          : "";
        return `<strong>${s.stage}</strong><br/>${s.contacts.toLocaleString()} contacts${convLine}`;
      },
    },
    xAxis: {
      type: "category",
      data: stages.map((s) => s.stage),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "var(--color-border)" } },
      axisLabel: { fontSize: 12, color: "var(--color-text-muted)" },
    },
    yAxis: {
      type: "value",
      axisLabel: {
        fontSize: 11,
        color: "var(--color-text-muted)",
        formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v),
      },
      splitLine: { lineStyle: { color: "var(--color-border)", type: "dashed" } },
    },
    series: [{
      type: "bar",
      data: stages.map((s, i) => ({
        value: s.contacts,
        itemStyle: { color: STAGE_COLORS[i] },
      })),
      barMaxWidth: 80,
      label: {
        show: true,
        position: "top",
        fontSize: 12,
        color: "var(--color-text)",
        formatter: (p: unknown) => {
          const v = (p as { value: number }).value;
          return typeof v === "number" ? v.toLocaleString() : String(v);
        },
      },
    }],
  }), [stages]);

  return <ReactECharts option={option} style={{ height: 280 }} />;
}

export function FunnelTrend({ rows }: { rows: FunnelTrendRow[] }) {
  const option = useMemo<EChartsOption>(() => {
    const periods = rows.map((r) => r.period);
    const mkSeries = (name: string, key: keyof FunnelTrendRow, color: string) => ({
      name,
      type: "line" as const,
      smooth: true,
      symbol: "circle",
      symbolSize: 5,
      lineStyle: { width: 2 },
      itemStyle: { color },
      data: rows.map((r) => r[key] as number),
    });
    return {
      grid: { left: 16, right: 16, top: 36, bottom: 40, containLabel: true },
      legend: {
        data: ["MQL", "SQL", "Opportunity", "Customer"],
        top: 4,
        right: 8,
        textStyle: { fontSize: 11, color: "#5b6573" },
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 12,
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
      },
      xAxis: {
        type: "category",
        data: periods,
        axisLabel: { fontSize: 11, color: "var(--color-text-muted)", rotate: 30 },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "var(--color-border)" } },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          fontSize: 11,
          color: "var(--color-text-muted)",
          formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v),
        },
        splitLine: { lineStyle: { color: "var(--color-border)", type: "dashed" } },
      },
      series: [
        mkSeries("MQL", "mql", STAGE_COLORS[0]),
        mkSeries("SQL", "sql", STAGE_COLORS[1]),
        mkSeries("Opportunity", "opp", STAGE_COLORS[2]),
        mkSeries("Customer", "customer", STAGE_COLORS[3]),
      ],
    };
  }, [rows]);

  return <ReactECharts option={option} style={{ height: 300 }} />;
}
