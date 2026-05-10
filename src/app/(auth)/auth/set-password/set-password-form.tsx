"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setPasswordAction, type SetPasswordState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Saving…" : "Save password and continue"}
    </Button>
  );
}

export function SetPasswordForm({ next }: { next?: string }) {
  const [state, action] = useActionState<SetPasswordState, FormData>(setPasswordAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      {state?.error ? (
        <p className="text-sm text-(--color-danger)" role="alert">
          {state.error}
        </p>
      ) : null}
      <Submit />
    </form>
  );
}
