import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * Streamed loading UI for any /dashboard/* route. Renders immediately while
 * the Server Component is fetching. Replaces the "Loading chart…" placeholder
 * the dynamic ECharts wrapper would otherwise show in isolation.
 */
export default function DashboardLoading() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <header>
        <div className="h-6 w-72 animate-pulse rounded bg-(--color-surface-2)" />
        <div className="mt-2 h-4 w-96 animate-pulse rounded bg-(--color-surface-2)" />
      </header>
      <div className="h-10 animate-pulse rounded-md border bg-(--color-surface)" />
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <CardHeader>
            <div className="h-5 w-48 animate-pulse rounded bg-(--color-surface-2)" />
            <div className="mt-1 h-3 w-72 animate-pulse rounded bg-(--color-surface-2)" />
          </CardHeader>
          <CardContent>
            <div className="h-[280px] animate-pulse rounded bg-(--color-surface-2)" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
