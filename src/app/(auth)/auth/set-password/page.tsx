import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SetPasswordForm } from "./set-password-form";

export const runtime = "nodejs";
export const metadata = { title: "Set password · Marketing BI" };

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Set your password</CardTitle>
        <CardDescription>
          Pick a password to finish setting up your account. You'll use it for future sign-ins.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SetPasswordForm next={next} />
      </CardContent>
    </Card>
  );
}
