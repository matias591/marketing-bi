"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ExcludedReason {
  label: string;
  count: number;
  detail?: string;
}

interface Props {
  /** Total candidate records before any filter. */
  total: number;
  /** Records that survive every filter and contribute to the chart. */
  included: number;
  /** Reasons records were dropped. Sum should equal `total - included`. */
  reasons: ExcludedReason[];
}

/**
 * DASH-13: per-chart transparency on how many records were excluded and why.
 * Collapsed by default; click to expand the breakdown.
 */
export function ExcludedReasons({ total, included, reasons }: Props) {
  const [open, setOpen] = useState(false);
  const excluded = Math.max(0, total - included);
  if (excluded === 0) {
    return (
      <p className="px-3 py-1.5 text-[11px] text-(--color-text-muted)">
        {included.toLocaleString()} of {total.toLocaleString()} records included · 0 excluded
      </p>
    );
  }

  return (
    <div className="border-t bg-(--color-surface-2)/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-[11px] text-(--color-text-muted)",
          "hover:text-(--color-text)",
        )}
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <span>
          <strong className="tabular-nums">{excluded.toLocaleString()}</strong>{" "}
          {excluded === 1 ? "record" : "records"} excluded
        </span>
        <span className="mx-1">·</span>
        <span className="tabular-nums">
          {included.toLocaleString()} of {total.toLocaleString()} shown
        </span>
      </button>
      {open ? (
        <ul className="ml-5 space-y-1 pb-2 text-[11px] text-(--color-text-muted)">
          {reasons
            .filter((r) => r.count > 0)
            .map((r) => (
              <li key={r.label}>
                <span className="tabular-nums">{r.count.toLocaleString()}</span> {r.label}
                {r.detail ? <span className="text-(--color-text-muted)/80"> — {r.detail}</span> : null}
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}
