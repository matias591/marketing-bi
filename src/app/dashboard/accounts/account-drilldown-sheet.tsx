"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Building2, ChevronRight, Loader2 } from "lucide-react";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface ContactRow {
  id: string;
  name: string;
  email: string | null;
  accountName: string | null;
  lifecycleStage: string | null;
  sqlDate: string | null;
}

interface ResponseShape {
  account: { id: string; name: string | null };
  contacts: ContactRow[];
}

/**
 * Click-to-open drill-down panel for an Account row.
 * On open, fetches /api/account/[id]/contacts and renders the contact list.
 */
export function AccountDrilldownSheet({
  accountId,
  accountName,
  children,
}: {
  accountId: string;
  accountName: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ResponseShape | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || data) return;
    let cancelled = false;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/account/${accountId}/contacts`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as ResponseShape;
        if (!cancelled) setData(json);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    });
    return () => { cancelled = true; };
  }, [open, accountId, data]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-(--color-text-muted)" />
            <SheetTitle>{accountName}</SheetTitle>
          </div>
          <SheetDescription>
            Contacts in this account. Click one to open their full journey.
          </SheetDescription>
        </SheetHeader>
        <SheetBody>
          {pending && !data ? (
            <div className="flex items-center gap-2 px-5 py-6 text-xs text-(--color-text-muted)">
              <Loader2 className="size-3.5 animate-spin" /> Loading contacts…
            </div>
          ) : error ? (
            <p className="px-5 py-6 text-xs text-(--color-danger)">Failed to load: {error}</p>
          ) : data ? (
            <ContactList contacts={data.contacts} />
          ) : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function ContactList({ contacts }: { contacts: ContactRow[] }) {
  if (contacts.length === 0) {
    return <p className="px-5 py-6 text-xs text-(--color-text-muted)">No contacts in this account.</p>;
  }
  return (
    <ul className="divide-y">
      {contacts.map((c) => (
        <li key={c.id}>
          <Link
            href={`/dashboard/journey?contactId=${c.id}`}
            className={cn(
              "flex items-center justify-between gap-3 px-5 py-2.5 transition-colors hover:bg-(--color-surface-2)",
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{c.name}</div>
              <div className="truncate text-[11px] text-(--color-text-muted)">
                {c.email ?? "—"}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-[11px] text-(--color-text-muted)">
              {c.sqlDate ? (
                <span className="text-(--color-accent)">SQL {c.sqlDate}</span>
              ) : c.lifecycleStage ? (
                <span>{c.lifecycleStage}</span>
              ) : null}
              <ChevronRight className="size-3.5" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
