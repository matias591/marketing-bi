"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition, useState, useEffect } from "react";
import { ATTRIBUTION_MODELS, DATE_PRESETS, type AttributionModel, type DatePreset } from "@/lib/dashboard-filters";
import { cn } from "@/lib/utils";

interface FilterBarProps {
  model: AttributionModel;
  preset: DatePreset;
  types: string[] | null;
  availableTypes: string[];
  compare: boolean;
  freshnessLabel?: string;
}

const PRESET_LABELS: Record<DatePreset, string> = {
  last_7_days: "Last 7d",
  last_30_days: "Last 30d",
  last_90_days: "Last 90d",
  this_month: "This month",
  last_month: "Last month",
  this_quarter: "This Q",
  last_quarter: "Last Q",
  ytd: "YTD",
  all_time: "All time",
  custom: "Custom",
};

const MODEL_LABELS: Record<AttributionModel, string> = {
  w_shaped: "W-Shaped",
  first_touch: "First touch",
  last_touch: "Last touch",
};

export function FilterBar({ model, preset, types, availableTypes, compare }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  // Local state gives instant visual feedback before the RSC round-trip completes.
  const [localModel, setLocalModel] = useState(model);
  const [localPreset, setLocalPreset] = useState(preset);
  const [localTypes, setLocalTypes] = useState(types);
  const [localCompare, setLocalCompare] = useState(compare);

  // Sync local state once the server response lands (props update).
  useEffect(() => { setLocalModel(model); }, [model]);
  useEffect(() => { setLocalPreset(preset); }, [preset]);
  useEffect(() => { setLocalTypes(types); }, [types]);
  useEffect(() => { setLocalCompare(compare); }, [compare]);

  function pushParams(updates: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  }

  function handleModel(m: AttributionModel) {
    setLocalModel(m);
    setLocalCompare(false);
    pushParams({ model: m, compare: null });
  }

  function handlePreset(p: DatePreset) {
    setLocalPreset(p);
    pushParams({ preset: p });
  }

  function handleCompare() {
    const next = !localCompare;
    setLocalCompare(next);
    pushParams({ compare: next ? "1" : null });
  }

  function handleToggleType(t: string) {
    const set = new Set(localTypes ?? []);
    if (set.has(t)) set.delete(t);
    else set.add(t);
    const newTypes = set.size === 0 ? null : Array.from(set);
    setLocalTypes(newTypes);
    pushParams({ types: newTypes ? newTypes.join(",") : null });
  }

  return (
    <>
      {/* Thin top-of-viewport progress bar while RSC round-trip is in flight */}
      {pending && (
        <div className="fixed inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-blue-500" />
      )}
      <div className="flex flex-wrap items-center gap-3 rounded-md border bg-(--color-surface) px-3 py-2 text-xs">
        <FilterGroup label="Date">
          {DATE_PRESETS.filter((p) => p !== "custom").map((p) => (
            <PillButton key={p} active={localPreset === p} onClick={() => handlePreset(p)}>
              {PRESET_LABELS[p]}
            </PillButton>
          ))}
        </FilterGroup>

        <FilterGroup label="Model">
          {ATTRIBUTION_MODELS.map((m) => (
            <PillButton
              key={m}
              active={!localCompare && localModel === m}
              onClick={() => handleModel(m)}
            >
              {MODEL_LABELS[m]}
            </PillButton>
          ))}
          <PillButton active={localCompare} onClick={handleCompare}>
            Compare all
          </PillButton>
        </FilterGroup>

        {availableTypes.length > 0 ? (
          <FilterGroup label="Type">
            {availableTypes.slice(0, 8).map((t) => (
              <PillButton
                key={t}
                active={localTypes?.includes(t) ?? false}
                onClick={() => handleToggleType(t)}
              >
                {t}
              </PillButton>
            ))}
            {localTypes && localTypes.length > 0 ? (
              <button
                onClick={() => { setLocalTypes(null); pushParams({ types: null }); }}
                className="rounded-full px-2 py-0.5 text-(--color-text-muted) hover:text-(--color-text)"
                type="button"
              >
                clear
              </button>
            ) : null}
          </FilterGroup>
        ) : null}

        <div className="ml-auto text-[10px] text-(--color-text-muted)">
          {pending ? "Updating…" : null}
        </div>
      </div>
    </>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-(--color-text-muted)">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function PillButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
        active
          ? "border-(--color-accent) bg-(--color-accent)/10 text-(--color-accent)"
          : "border-(--color-border) bg-(--color-surface) text-(--color-text-muted) hover:bg-(--color-surface-2) hover:text-(--color-text)",
      )}
    >
      {children}
    </button>
  );
}
