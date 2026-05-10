import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CampaignBarChart } from "./campaign-bar-chart";
import { getCampaignContributionToSqls } from "./query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Campaigns · Marketing BI" };

export default async function CampaignsPage() {
  const rows = await getCampaignContributionToSqls(20);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Campaign Contribution to SQLs</h1>
        <p className="mt-1 text-sm text-(--color-text-muted)">
          Number of distinct Contacts who became SQL after touching each campaign.
          Phase 1 uses simple "touchpoint before SQL" semantics — the full attribution
          model (90-day window, per-stage credit, first / last / linear toggle) ships in
          Phase 3 with the methodology page.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Top {rows.length} campaigns</CardTitle>
          <CardDescription>
            Sourced live from <code>raw.sf_campaign</code>, <code>raw.sf_contact</code>,{" "}
            <code>raw.sf_campaign_member</code>. Soft-deleted records are filtered out.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <EmptyState />
          ) : (
            <CampaignBarChart data={rows} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-(--color-surface) py-16 text-center">
      <p className="text-sm font-medium">No data yet.</p>
      <p className="max-w-sm text-xs text-(--color-text-muted)">
        Either no sync has run, or no Contacts have <code>sql_date</code> set in
        Salesforce. Trigger a manual sync via{" "}
        <code className="rounded bg-(--color-surface-2) px-1">POST /api/cron/sync</code>{" "}
        with the cron secret, or wait for the weekly cron.
      </p>
    </div>
  );
}
