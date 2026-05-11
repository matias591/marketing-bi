import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/admin-guard";
import { TriggerSyncButton } from "./trigger-button";
import { getRecentSyncErrors, getRecentSyncRuns, getWatermarks } from "./query";
import { cn } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Admin · Sync · Marketing BI" };

const STATUS_STYLES: Record<string, string> = {
  success:
    "bg-(--color-success)/10 text-(--color-success) border-(--color-success)/30",
  partial:
    "bg-(--color-warning)/10 text-(--color-warning) border-(--color-warning)/30",
  failed: "bg-(--color-danger)/10 text-(--color-danger) border-(--color-danger)/30",
  running:
    "bg-(--color-accent)/10 text-(--color-accent) border-(--color-accent)/30",
};

export default async function AdminSyncPage() {
  await requireAdmin();

  const [runs, watermarks, errors] = await Promise.all([
    getRecentSyncRuns(30),
    getWatermarks(),
    getRecentSyncErrors(50),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Sync operations</h1>
          <p className="mt-1 text-sm text-(--color-text-muted)">
            Salesforce → Postgres pipeline state. Cron runs daily at 06:00 UTC; you can also trigger
            a run manually below.
          </p>
        </div>
        <TriggerSyncButton />
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Per-object watermarks</CardTitle>
          <CardDescription>
            The highest <code>LastModifiedDate</code> seen for each object. Drives incremental
            extraction on the next run.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {watermarks.length === 0 ? (
            <p className="px-4 py-6 text-sm text-(--color-text-muted)">
              No watermarks yet — first run hasn't completed.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-(--color-surface-2) text-xs uppercase tracking-wide text-(--color-text-muted)">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Object</th>
                  <th className="px-3 py-2 text-left font-medium">Watermark</th>
                  <th className="px-3 py-2 text-left font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {watermarks.map((w, i) => (
                  <tr
                    key={w.objectName}
                    className={cn(
                      "border-b last:border-b-0",
                      i % 2 === 1 && "bg-(--color-surface-2)/30",
                    )}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{w.objectName}</td>
                    <td className="px-3 py-2 tabular-nums text-(--color-text-muted)">
                      {w.lastModifiedDate ? w.lastModifiedDate.slice(0, 19).replace("T", " ") : "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-(--color-text-muted)">
                      {w.updatedAt ? w.updatedAt.slice(0, 19).replace("T", " ") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent runs · last {runs.length}</CardTitle>
          <CardDescription>
            Status pill: green=success, amber=partial (some objects failed but others succeeded),
            red=failed, blue=running.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {runs.length === 0 ? (
            <p className="px-4 py-6 text-sm text-(--color-text-muted)">
              No runs yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-(--color-surface-2) text-xs uppercase tracking-wide text-(--color-text-muted)">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Started</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Duration</th>
                  <th className="px-3 py-2 text-right font-medium">Rows upserted</th>
                  <th className="px-3 py-2 text-left font-medium">Trigger</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r, i) => (
                  <tr
                    key={r.id}
                    className={cn(
                      "border-b last:border-b-0 align-top",
                      i % 2 === 1 && "bg-(--color-surface-2)/30",
                    )}
                  >
                    <td className="px-3 py-2 tabular-nums">
                      {r.startedAt.slice(0, 19).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                          STATUS_STYLES[r.status] ?? STATUS_STYLES.running,
                        )}
                      >
                        {r.status}
                      </span>
                      {r.error ? (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[11px] text-(--color-text-muted) hover:text-(--color-text)">
                            errors
                          </summary>
                          <pre className="mt-1 max-w-xl whitespace-pre-wrap break-words rounded bg-(--color-surface) p-2 text-[10px] text-(--color-text-muted)">
                            {r.error}
                          </pre>
                        </details>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-(--color-text-muted)">
                      {r.durationSeconds != null ? `${r.durationSeconds}s` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.totalUpserted.toLocaleString()}
                      {Object.keys(r.rowCounts).length > 0 ? (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-right text-[11px] text-(--color-text-muted) hover:text-(--color-text)">
                            per-object
                          </summary>
                          <ul className="mt-1 space-y-0.5 text-right text-[10px] text-(--color-text-muted)">
                            {Object.entries(r.rowCounts).map(([obj, v]) => (
                              <li key={obj}>
                                {obj}: <span className="tabular-nums">{Number(v?.upserted ?? 0).toLocaleString()}</span>
                                {v?.durationMs != null ? ` (${Math.round(v.durationMs / 1000)}s)` : null}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-(--color-text-muted)">{r.triggeredBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent errors · last {errors.length}</CardTitle>
          <CardDescription>
            Per-object errors from <code>ops.sync_errors</code>. <code>INVALID_FIELD_RECOVERED</code> entries
            mean the sync self-healed by dropping the offending field and continuing.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {errors.length === 0 ? (
            <p className="px-4 py-6 text-sm text-(--color-text-muted)">
              No errors recorded. 🎉
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-(--color-surface-2) text-xs uppercase tracking-wide text-(--color-text-muted)">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">When</th>
                  <th className="px-3 py-2 text-left font-medium">Object</th>
                  <th className="px-3 py-2 text-left font-medium">Code</th>
                  <th className="px-3 py-2 text-left font-medium">Message</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((e, i) => (
                  <tr
                    key={e.id}
                    className={cn(
                      "border-b align-top last:border-b-0",
                      i % 2 === 1 && "bg-(--color-surface-2)/30",
                    )}
                  >
                    <td className="px-3 py-2 tabular-nums text-(--color-text-muted)">
                      {e.occurredAt.slice(0, 19).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{e.objectName}</td>
                    <td className="px-3 py-2 text-xs text-(--color-text-muted)">{e.errorCode ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
