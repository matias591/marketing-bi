import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const runtime = "nodejs";
export const metadata = { title: "Methodology · Marketing BI" };

export default function MethodologyPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">How attribution is computed</h1>
        <p className="mt-2 text-sm text-(--color-text-muted)">
          The exact rules every dashboard chart uses. Read this once when reconciling against
          Salesforce native reports — divergences are intentional and listed below.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Lifecycle stages</CardTitle>
          <CardDescription>
            Attribution credit is computed independently at each lifecycle transition, not pooled
            into a single bucket. A Contact who reaches MQL, then SQL, then Opp, then Customer
            accrues four separate windowed credit calculations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>Stage transition dates are derived from the data we sync from Salesforce:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <strong>MQL</strong> — earliest <code>Presentation__c.CreatedDate</code> per Contact.
            </li>
            <li>
              <strong>SQL</strong> — <code>Contact.SQL_Date__c</code> (set automatically by a SF
              workflow when a BDR creates a Presentation).
            </li>
            <li>
              <strong>Opportunity</strong> — earliest <code>Opportunity.CreatedDate</code> the
              Contact participates on (joined via OpportunityContactRole).
            </li>
            <li>
              <strong>Customer</strong> — earliest <code>Opportunity.CloseDate</code> where{" "}
              <code>IsWon = true</code> the Contact contributed to.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Touchpoints</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            A touchpoint is one (Contact, Campaign) pair. CampaignMember rows are deduped per pair
            and the timestamp is the earliest{" "}
            <code>COALESCE(first_responded_date, created_date)</code>.
          </p>
          <p>
            All <code>CampaignMember</code> statuses count, including <code>Sent</code> — not
            filtered to <code>Responded</code>. This is intentional: a Contact who attended a
            webinar after only being on a Sent list still got value from that campaign.
          </p>
          <p>
            Soft-deleted Contacts (<code>IsDeleted = true</code>) are excluded from all
            attribution. Their CampaignMember rows are mirrored in <code>raw.sf_*</code> for
            historical truth but never join into <code>mart.*</code>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attribution models</CardTitle>
          <CardDescription>
            Three models compute simultaneously and are pre-materialized so the dashboard's model
            toggle is instant.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            For each (Contact, lifecycle stage) pair, the eligible touchpoints are those whose
            timestamp falls in the window:
          </p>
          <p className="rounded bg-(--color-surface-2) p-2 font-mono text-xs">
            transition_date − 90 days &nbsp;≤&nbsp; touchpoint_at &nbsp;&lt;&nbsp; transition_date
          </p>
          <p>
            The boundary is <strong>strictly less than</strong> the transition. Same-day-of and
            after-the-fact touchpoints don't count toward that stage's credit.
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <strong>First-touch</strong>: 1.0 credit to the campaign with the earliest in-window
              touchpoint.
            </li>
            <li>
              <strong>Last-touch</strong>: 1.0 credit to the campaign with the latest in-window
              touchpoint.
            </li>
            <li>
              <strong>Linear multi-touch</strong>: 1/N credit to each in-window touchpoint, where N
              is the count of in-window touchpoints for that Contact-stage pair.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Closed Won revenue (Phase 4)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p>
            When dashboards show Closed Won revenue (Phase 4), the deal amount is split equally
            across all <code>OpportunityContactRole</code> Contacts on that Opportunity. Decision
            Maker / Influencer weighting is deferred to v2.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Known divergences from Salesforce native reports</CardTitle>
          <CardDescription>
            Honest list of where these numbers won't match SF's built-in Campaign Influence reports.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ul className="ml-5 list-disc space-y-2">
            <li>
              <strong>MQL ≈ SQL collapse for Presentation-driven Contacts.</strong> If a Contact's
              first SF activity was a BDR-created Presentation, their MQL and SQL dates are the
              same day (the SF trigger flips Lifecycle to SQL on Presentation creation). Both
              stages then credit the same touchpoint set. Contacts who reached MQL through other
              channels first have separable dates.
            </li>
            <li>
              <strong>First/last source uses <code>LeadSource</code> + <code>Last_Lead_Source__c</code>.</strong>{" "}
              The org doesn't have <code>Original_Source__c</code> / <code>Latest_Source__c</code>{" "}
              custom fields. We use the SF standard <code>LeadSource</code> field (original) and{" "}
              <code>Last_Lead_Source__c</code> (latest).
            </li>
            <li>
              <strong>Account-as-of-event uses current account_id.</strong> When a Contact is
              reassigned across Accounts in SF, our account-level rollups credit their historical
              attribution to the <em>current</em> Account, not the one at the time of the
              transition. Snapshotting <code>account_id</code> per sync is a future improvement;
              past divergence is permanent.
            </li>
            <li>
              <strong>All CampaignMember statuses count.</strong> SF's default Campaign Influence
              reports often filter to <code>Responded</code>. We don't — Sent / Bounced /
              Unsubscribed all count as touchpoints. This means our totals are typically higher
              than SF's.
            </li>
            <li>
              <strong>Source history fallback.</strong>{" "}
              <code>ops.contact_source_history</code> snapshots <code>LeadSource</code> /{" "}
              <code>Last_Lead_Source__c</code> on every cron run starting from the FIRST run after
              this app was deployed. For Contacts whose lifecycle transition happened before our
              first sync, we fall back to the current value in <code>raw.sf_contact</code>. After
              enough sync runs, this fallback fades.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Verification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            The SQL implementation in <code>mart.attribution_contact</code> is verified against a
            TypeScript reference implementation in <code>src/lib/attribution/linear.ts</code> via
            a Vitest parity test (<code>__tests__/attribution.test.ts</code>). The test seeds a
            small fixture into <code>raw.sf_*</code>, runs both implementations, and asserts every
            (Contact, stage, model, Campaign, credit) row is identical.
          </p>
          <p>
            Run <code>pnpm test</code> from the repo to execute the suite. The test runs against
            your live Supabase project but only inserts/deletes rows it owns (test-prefixed IDs).
          </p>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-(--color-text-muted)">
        Methodology last updated 2026-05-10. Changes are committed to git — see the project repo
        for full history.
      </p>
    </div>
  );
}
