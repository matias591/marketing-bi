"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Coins, Route, Building2, Layers, BookOpen, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
  comingSoon?: boolean;
}

const NAV: NavItem[] = [
  { href: "/dashboard/campaigns", label: "Campaigns (G1)", icon: BarChart3, enabled: true },
  { href: "/dashboard/revenue", label: "Revenue (G4)", icon: Coins, enabled: true },
  { href: "/dashboard/journey", label: "Contact Journey (G2)", icon: Route, enabled: true },
  { href: "/dashboard/accounts", label: "Accounts (G3)", icon: Building2, enabled: true },
  { href: "/dashboard/depth", label: "Touchpoint Depth (G5)", icon: Layers, enabled: true },
];

export function Sidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-(--color-border) bg-(--color-surface) px-2.5 py-3">
      <div className="mb-4 px-2">
        <div className="text-[13px] font-semibold tracking-tight">Marketing BI</div>
        <div className="text-[10px] uppercase tracking-wide text-(--color-text-soft)">Salesforce attribution</div>
      </div>
      <nav className="flex flex-col gap-0.5">
        {NAV.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          if (!item.enabled) {
            return (
              <span
                key={item.href}
                className={cn(
                  "flex cursor-not-allowed items-center gap-2 rounded-md px-2.5 py-1.5 text-sm",
                  "text-(--color-text-muted) opacity-60",
                )}
                title="Coming soon"
              >
                <Icon className="size-4" />
                <span className="flex-1">{item.label}</span>
                {item.comingSoon ? (
                  <span className="text-[10px] uppercase tracking-wide">Soon</span>
                ) : null}
              </span>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                isActive
                  ? "bg-(--color-surface-2) text-(--color-text) font-medium"
                  : "text-(--color-text-muted) hover:bg-(--color-surface-2) hover:text-(--color-text)",
              )}
            >
              <Icon className="size-4" />
              <span className="flex-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      {isAdmin ? (
        <nav className="mt-4 flex flex-col gap-0.5 border-t pt-4">
          <div className="mb-1 px-2 text-[10px] uppercase tracking-wide text-(--color-text-muted)">
            Admin
          </div>
          <Link
            href="/dashboard/admin/sync"
            prefetch={false}
            className={cn(
              "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
              pathname === "/dashboard/admin/sync"
                ? "bg-(--color-surface-2) text-(--color-text) font-medium"
                : "text-(--color-text-muted) hover:bg-(--color-surface-2) hover:text-(--color-text)",
            )}
          >
            <Settings2 className="size-4" />
            <span className="flex-1">Sync operations</span>
          </Link>
        </nav>
      ) : null}
      <div className="mt-auto px-2 pt-4">
        <Link
          href="/methodology"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-(--color-text-muted) hover:text-(--color-text)"
        >
          <BookOpen className="size-3.5" />
          How attribution is computed
        </Link>
      </div>
    </aside>
  );
}
