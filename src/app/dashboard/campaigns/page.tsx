import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CampaignBarChart } from "./campaign-bar-chart";
import { getCampaignContributionToSqls } from "./query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Campaigns · Marketing BI" };

export default async function CampaignsPage() {
  const rows = await getCampaignContributionToSqls(20, "linear");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Campaign Contribution to SQLs</h1>
        <p className="mt-1 text-sm text-(--color-text-muted)">
          Linear multi-touch credit per campaign at the SQL stage. Each Contact's credit is
          split equally across all campaigns they touched within 90 days strictly before their
          SQL transition. Bar shows total credit; the count below shows distinct contributing Contacts.
          See <a className="underline" href="/methodology">methodology</a> for full details.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Top {rows.length} campaigns</CardTitle>
          <CardDescription>
            Source: <code>mart.attribution_contact</code> (linear model, SQL stage). Refreshed at
            the end of every cron sync run.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? <EmptyState /> : <CampaignBarChart data={rows} />}
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
        Either no sync has run, the marts haven't been refreshed, or no Contacts have touchpoints
        within the 90-day window before their SQL transition. Run{" "}
        <code className="rounded bg-(--color-surface-2) px-1">POST /api/cron/sync</code> with the
        cron secret to sync + refresh, or wait for the weekly cron.
      </p>
    </div>
  );
}
