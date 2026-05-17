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
          <p>Stage transition dates come from Salesforce:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <strong>MQL</strong> — <code>HubSpot_MQL_Date__c</code> on the Contact record
              (HubSpot MQL date synced into Salesforce).
            </li>
            <li>
              <strong>SQL</strong> — <code>Contact.SQL_Date__c</code> (set automatically when a BDR
              creates a Presentation record).
            </li>
            <li>
              <strong>Opportunity</strong> — earliest <code>Opportunity.CreatedDate</code> the
              Contact participates on (via OpportunityContactRole). Must be on or after SQL date;
              cases where it precedes SQL are flagged as data quality issues.
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
          <CardTitle>Qualifying touch points</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            A touch point is one (Contact, Campaign) pair — deduped, with timestamp set to the
            earliest <code>COALESCE(first_responded_date, created_date)</code>.
          </p>
          <p>
            <strong>Only active-engagement Campaign Member statuses qualify</strong>:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <strong>Registered</strong> ✓ — Contact actively registered for an event.
            </li>
            <li>
              <strong>Attended</strong> ✓ — Contact attended the event.
            </li>
            <li>
              <strong>Responded</strong> ✓ — Contact explicitly responded.
            </li>
            <li>
              <strong>Invited</strong> ✗ — No action taken by the Contact.
            </li>
            <li>
              <strong>Email Opened</strong> ✗ — Excluded due to bot and false-positive risk.
            </li>
            <li>
              <strong>Rejected / No Response</strong> ✗ — Passive non-engagement.
            </li>
          </ul>
          <p>
            Soft-deleted Contacts (<code>IsDeleted = true</code>) are excluded from all
            attribution. Their rows are mirrored in <code>raw.sf_*</code> for historical truth but
            never join into <code>mart.*</code>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attribution window</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            The eligible touch point window is <strong>12 months anchored to the SQL create
            date</strong>, applied to all four stages:
          </p>
          <p className="rounded bg-(--color-surface-2) p-2 font-mono text-xs">
            sql_date − 12 months &nbsp;≤&nbsp; touchpoint_at &nbsp;&lt;&nbsp; transition_date
          </p>
          <p>
            The upper boundary is <strong>strictly less than</strong> the transition date — same-day
            and after-the-fact touch points don't count toward that stage's credit. The lower
            boundary is always the SQL date minus one year, not the individual stage date, so all
            stages share a consistent look-back window regardless of how long MQL→SQL or SQL→Customer
            took.
          </p>
          <p>
            For MQL (which precedes SQL in the funnel), the window falls back to{" "}
            <code>mql_date − 12 months</code> when the Contact has no SQL date.
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
          <ul className="ml-5 list-disc space-y-2">
            <li>
              <strong>W-Shaped</strong> — every qualifying touch point earns{" "}
              <strong>1 absolute credit point</strong>. A Contact with 20 qualifying touches
              contributes 20 total credit points; a Contact with 2 contributes 2. First and last
              touches are always guaranteed their 1 point, making them proportionally heavier for
              contacts with fewer total touches. Credit is expressed in absolute points (not
              fractions) so campaign totals can be compared across contacts with different touch
              counts.
            </li>
            <li>
              <strong>First-touch</strong> — 1.0 credit to the campaign with the earliest
              qualifying touch point within the window.
            </li>
            <li>
              <strong>Last-touch</strong> — 1.0 credit to the campaign with the latest qualifying
              touch point within the window.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Campaign structure</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            One campaign per event. All lifecycle stages of a single event (invite, registration,
            attendance, follow-up) are managed via Campaign Member Statuses within a single
            campaign. Only <strong>Registered</strong>, <strong>Attended</strong>, and{" "}
            <strong>Responded</strong> statuses contribute to attribution (see Qualifying touch
            points above).
          </p>
          <p>
            Campaign fields used for ROI analysis: Start Date (first outreach), End Date (event
            date), Budgeted Cost, Actual Cost, Campaign Type.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Closed Won revenue</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p>
            Deal amount is split equally across all distinct <code>OpportunityContactRole</code>{" "}
            Contacts on that Opportunity (ATTR-11 OCR equal split). Each Contact's share is then
            weighted by their customer-stage attribution credit. Decision Maker / Influencer role
            weighting is deferred to v2.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data quality flags</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <p>
            The sync admin page surfaces two data quality conditions in{" "}
            <code>mart.data_quality_flags</code>:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>
              <strong>opp_before_sql</strong> — an Opportunity was created before the Contact
              reached SQL stage. These records are included in attribution but flagged.
            </li>
            <li>
              <strong>opp_without_sql</strong> — an Opportunity exists for a Contact who has no SQL
              date. Again included but flagged.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Known divergences from Salesforce native reports</CardTitle>
          <CardDescription>
            Honest list of where these numbers won&apos;t match SF's built-in Campaign Influence
            reports.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ul className="ml-5 list-disc space-y-2">
            <li>
              <strong>MQL ≈ SQL collapse for Presentation-driven Contacts.</strong> If a Contact's
              first SF activity was a BDR-created Presentation, their MQL and SQL dates are the
              same day. Both stages then credit the same touch point set.
            </li>
            <li>
              <strong>
                First/last source uses <code>LeadSource</code> +{" "}
                <code>Last_Lead_Source__c</code>.
              </strong>{" "}
              We use the SF standard <code>LeadSource</code> field (original) and{" "}
              <code>Last_Lead_Source__c</code> (latest) rather than HubSpot's{" "}
              <code>Original_Source__c</code> / <code>Latest_Source__c</code> custom fields.
            </li>
            <li>
              <strong>Account-as-of-event uses current account_id.</strong> When a Contact is
              reassigned across Accounts in SF, historical attribution credits the{" "}
              <em>current</em> Account, not the one at transition time. Snapshotting{" "}
              <code>account_id</code> per sync is a future improvement.
            </li>
            <li>
              <strong>
                Only Registered / Attended / Responded statuses count.
              </strong>{" "}
              SF's default Campaign Influence often includes <code>Sent</code> and other passive
              statuses. Our touch point totals will be lower and more conservative than SF's.
            </li>
            <li>
              <strong>Source history fallback.</strong>{" "}
              <code>ops.contact_source_history</code> snapshots source fields starting from the
              first sync run. For Contacts whose lifecycle transition happened before deployment,
              we fall back to the current value in <code>raw.sf_contact</code>. This fallback fades
              as more sync runs accumulate.
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
            TypeScript reference implementation in <code>src/lib/attribution/wshape.ts</code> via a
            Vitest parity test (<code>__tests__/attribution.test.ts</code>). The test seeds a small
            fixture (including Invited-status members that must be excluded), runs both
            implementations, and asserts every (Contact, stage, model, Campaign, credit) row is
            identical.
          </p>
          <p>
            Run <code>pnpm test</code> from the repo to execute the suite (requires a live Supabase
            connection via <code>DATABASE_URL</code> or <code>DIRECT_DATABASE_URL</code>).
          </p>
        </CardContent>
      </Card>

      <p className="text-center text-xs text-(--color-text-muted)">
        Methodology updated 2026-05-17 (business call: W-shaped model, 12-month SQL-anchored window,
        status filter). Changes are committed to git — see the project repo for full history.
      </p>
    </div>
  );
}
