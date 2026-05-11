import { CircleDot, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimelineEvent } from "./query";

interface Props {
  events: TimelineEvent[];
  milestones: { stage: "MQL" | "SQL" | "Opp" | "Customer"; date: string }[];
}

const STAGE_COLOR: Record<string, string> = {
  MQL: "bg-(--color-warning)/15 text-(--color-warning) border-(--color-warning)/30",
  SQL: "bg-(--color-accent)/15 text-(--color-accent) border-(--color-accent)/30",
  Opp: "bg-(--color-success)/15 text-(--color-success) border-(--color-success)/30",
  Customer: "bg-(--color-success)/25 text-(--color-success) border-(--color-success)/40",
};

/**
 * Vertical timeline. Each row is a CampaignMember touchpoint. Lifecycle
 * milestones (MQL/SQL/Opp/Customer) are inserted between rows at their
 * dates so the visual ordering is faithful — the milestone pill sits at
 * the transition boundary, with all later touchpoints below it.
 */
export function Timeline({ events, milestones }: Props) {
  // Merge events + milestones into one chronological list.
  type Row =
    | { kind: "event"; date: string; event: TimelineEvent }
    | { kind: "milestone"; date: string; stage: string };

  const rows: Row[] = [
    ...events.map((e) => ({ kind: "event" as const, date: e.touchpointAt, event: e })),
    ...milestones.map((m) => ({ kind: "milestone" as const, date: m.date, stage: m.stage })),
  ].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    // Milestones go after events on the same date (the day's last action wins)
    if (a.kind !== b.kind) return a.kind === "event" ? -1 : 1;
    return 0;
  });

  if (rows.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-(--color-text-muted)">
        No touchpoints recorded for this contact.
      </p>
    );
  }

  return (
    <ol className="relative ml-6 space-y-3 border-l border-(--color-border) py-2 pl-6">
      {rows.map((row, i) => {
        if (row.kind === "milestone") {
          return (
            <li key={`m-${i}`} className="relative">
              <span className="absolute -left-[34px] top-0.5 flex size-6 items-center justify-center rounded-full bg-(--color-surface) ring-2 ring-(--color-surface)">
                <Flag className="size-3.5 text-(--color-accent)" />
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    STAGE_COLOR[row.stage] ?? "",
                  )}
                >
                  Reached {row.stage}
                </span>
                <span className="text-xs text-(--color-text-muted) tabular-nums">{row.date}</span>
              </div>
            </li>
          );
        }
        const e = row.event;
        return (
          <li key={`e-${i}`} className="relative">
            <span className="absolute -left-[31px] top-1.5 size-2.5 rounded-full bg-(--color-accent)/50 ring-2 ring-(--color-surface)" aria-hidden>
              <CircleDot className="hidden" />
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{e.campaignName ?? e.campaignId}</span>
              <span className="text-xs text-(--color-text-muted)">
                <span className="tabular-nums">{e.touchpointAt}</span>
                {e.campaignType ? <> · {e.campaignType}</> : null}
                {e.status ? <> · {e.status}</> : null}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
