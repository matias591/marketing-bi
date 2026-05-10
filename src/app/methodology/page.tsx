import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const runtime = "nodejs";
export const metadata = { title: "Methodology · Marketing BI" };

export default function MethodologyPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>How attribution is computed</CardTitle>
          <CardDescription>Coming in Phase 3.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-(--color-text-muted)">
          <p>
            This page will document the production attribution methodology — first / last /
            linear models, the 90-day window before each lifecycle transition, per-stage
            independent credit, OCR equal-split on Closed Won, deletion-filter behavior,
            and known divergences from Salesforce native reports.
          </p>
          <p className="mt-3">
            Phase 1's <code>/dashboard/campaigns</code> chart uses a simpler "touchpoint
            before SQL" rule that proves the data pipeline. The methodology rigor lives
            with the marts in Phase 3 (ATTR-12).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
