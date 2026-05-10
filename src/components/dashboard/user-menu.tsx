"use client";

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, LogOut, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function UserMenu({ email, role }: { email: string; role: string }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(
          "inline-flex items-center gap-2 rounded-md border bg-(--color-surface) px-2.5 py-1.5 text-sm",
          "hover:bg-(--color-surface-2) focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-(--color-accent)/40",
        )}
      >
        <UserIcon className="size-4" />
        <span className="max-w-[180px] truncate">{email}</span>
        {role === "admin" ? (
          <span className="rounded bg-(--color-accent)/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-(--color-accent)">
            admin
          </span>
        ) : null}
        <ChevronDown className="size-3.5 text-(--color-text-muted)" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="min-w-44 rounded-md border bg-(--color-surface) p-1 shadow-lg"
        >
          <form action="/auth/sign-out" method="post">
            <DropdownMenu.Item asChild>
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-(--color-text) hover:bg-(--color-surface-2) outline-hidden"
              >
                <LogOut className="size-3.5" />
                Sign out
              </button>
            </DropdownMenu.Item>
          </form>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
