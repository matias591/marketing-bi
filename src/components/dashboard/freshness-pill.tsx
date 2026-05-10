import { cn } from "@/lib/utils";
import { freshnessLabel, freshnessLevel } from "@/lib/freshness";

const LEVEL_STYLES: Record<string, string> = {
  green: "bg-(--color-success)/10 text-(--color-success) border-(--color-success)/30",
  yellow: "bg-(--color-warning)/10 text-(--color-warning) border-(--color-warning)/30",
  red: "bg-(--color-danger)/10 text-(--color-danger) border-(--color-danger)/30",
  unknown: "bg-(--color-surface-2) text-(--color-text-muted) border-(--color-border)",
};

export function FreshnessPill({ syncedAt }: { syncedAt: Date | null }) {
  const level = freshnessLevel(syncedAt);
  const label = freshnessLabel(syncedAt);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        LEVEL_STYLES[level],
      )}
      aria-label={`Data freshness: ${level}`}
      title={label}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  );
}
