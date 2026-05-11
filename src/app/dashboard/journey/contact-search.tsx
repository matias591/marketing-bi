"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ContactSearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const q = String(fd.get("q") ?? "").trim();
    startTransition(() => {
      router.replace(q ? `/dashboard/journey?q=${encodeURIComponent(q)}` : `/dashboard/journey`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <Input
        name="q"
        defaultValue={initialQuery}
        placeholder="Search contacts by name or email…"
        className="max-w-md"
      />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Searching…" : "Search"}
      </Button>
    </form>
  );
}
