"use client";

import * as React from "react";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";
import type { AccountLeaderboardRow } from "./query";
import { AccountDrilldownSheet } from "./account-drilldown-sheet";
import { cn } from "@/lib/utils";

const usd = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

const columns: ColumnDef<AccountLeaderboardRow>[] = [
  {
    accessorKey: "accountName",
    header: "Account",
    cell: ({ row }) => {
      const label = row.original.accountName ?? row.original.accountId;
      return (
        <AccountDrilldownSheet accountId={row.original.accountId} accountName={label}>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-left font-medium hover:underline"
            title={`See contacts in ${label}`}
          >
            <span className="truncate">{label}</span>
            <ChevronRight className="size-3 text-(--color-text-muted)" />
          </button>
        </AccountDrilldownSheet>
      );
    },
  },
  {
    accessorKey: "engagedContacts",
    header: "Engaged contacts",
    cell: ({ getValue }) => <span className="tabular-nums">{Number(getValue()).toLocaleString()}</span>,
  },
  {
    accessorKey: "sqlContacts",
    header: "SQL contacts",
    cell: ({ getValue }) => <span className="tabular-nums">{Number(getValue()).toLocaleString()}</span>,
  },
  {
    accessorKey: "closedWonRevenue",
    header: "Closed Won",
    cell: ({ getValue }) => {
      const v = Number(getValue());
      return (
        <span className={cn("tabular-nums", v > 0 ? "text-(--color-success)" : "text-(--color-text-muted)")}>
          {v > 0 ? usd.format(v) : "—"}
        </span>
      );
    },
  },
  {
    accessorKey: "lastTouchAt",
    header: "Last touch",
    cell: ({ getValue }) => (
      <span className="tabular-nums text-(--color-text-muted)">{formatDate(getValue() as string | null)}</span>
    ),
  },
];

export function AccountLeaderboardTable({ data }: { data: AccountLeaderboardRow[] }) {
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "closedWonRevenue", desc: true },
  ]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="overflow-auto rounded-md border bg-(--color-surface)">
      <table className="w-full text-sm">
        <thead className="border-b bg-(--color-surface-2) text-xs uppercase tracking-wide text-(--color-text-muted)">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const sortDir = header.column.getIsSorted();
                return (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className={cn(
                      "px-3 py-1.5 text-left font-medium",
                      header.column.getCanSort() && "cursor-pointer select-none",
                    )}
                  >
                    <span className="inline-flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {sortDir === "asc" ? (
                        <ArrowUp className="size-3" />
                      ) : sortDir === "desc" ? (
                        <ArrowDown className="size-3" />
                      ) : header.column.getCanSort() ? (
                        <ArrowUpDown className="size-3 opacity-30" />
                      ) : null}
                    </span>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-(--color-text-muted)">
                No accounts match the current filters.
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row, i) => (
              <tr
                key={row.id}
                className={cn(
                  "border-b last:border-b-0",
                  i % 2 === 1 && "bg-(--color-surface-2)/30",
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-1.5">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
