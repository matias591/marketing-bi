/**
 * Mobile fallback (PLAT-07): top-N entries as a vertical list, no chart.
 * The chart renders on screens >=md; this list renders on screens <md.
 * Use side-by-side wrappers (`hidden md:block` for the chart, `md:hidden`
 * for the list) to swap.
 */
interface Item {
  label: string;
  sublabel?: string;
  value: string;
}

export function MobileTopList({ title, items, footnote }: { title: string; items: Item[]; footnote?: string }) {
  return (
    <div className="rounded-md border bg-(--color-surface) p-3">
      <div className="mb-2 text-xs uppercase tracking-wide text-(--color-text-muted)">{title}</div>
      {items.length === 0 ? (
        <p className="py-4 text-center text-sm text-(--color-text-muted)">No data.</p>
      ) : (
        <ol className="space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className="flex items-start justify-between gap-2 border-b py-1.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{item.label}</div>
                {item.sublabel ? (
                  <div className="truncate text-[11px] text-(--color-text-muted)">{item.sublabel}</div>
                ) : null}
              </div>
              <div className="shrink-0 text-sm font-medium tabular-nums">{item.value}</div>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-2 text-[10px] text-(--color-text-muted)">
        {footnote ?? "View on desktop for the full chart."}
      </p>
    </div>
  );
}
