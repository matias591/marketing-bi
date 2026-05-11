"use client";

import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Small download icon for each dashboard card. Constructs a /api/export/csv
 * URL with the active page's filter searchParams + a chart name. Browser
 * download via target="_blank" rel="noopener" so the page doesn't navigate.
 */
export function ExportCsvButton({
  chart,
  label,
  className,
}: {
  chart: string;
  label?: string;
  className?: string;
}) {
  const sp = useSearchParams();
  const params = new URLSearchParams(sp?.toString() ?? "");
  params.set("chart", chart);
  const href = `/api/export/csv?${params.toString()}`;

  return (
    <a
      href={href}
      // download attribute hints filename + suppresses navigation in modern browsers
      download
      target="_blank"
      rel="noopener"
      className={cn(
        "inline-flex items-center gap-1 rounded-md border bg-(--color-surface) px-2 py-1 text-[11px] text-(--color-text-muted)",
        "hover:bg-(--color-surface-2) hover:text-(--color-text)",
        className,
      )}
      title="Download as CSV"
    >
      <Download className="size-3" />
      {label ?? "CSV"}
    </a>
  );
}
