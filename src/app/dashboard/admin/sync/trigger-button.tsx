"use client";

import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { triggerSyncAction } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Triggering…" : "Run sync now"}
    </Button>
  );
}

export function TriggerSyncButton() {
  const [state, action] = useActionState(
    async () => triggerSyncAction(),
    { ok: false, message: "" } as { ok: boolean; message: string },
  );
  return (
    <form action={action} className="flex items-center gap-3">
      <Submit />
      {state.message ? (
        <span
          className={
            state.ok
              ? "text-xs text-(--color-success)"
              : "text-xs text-(--color-danger)"
          }
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
