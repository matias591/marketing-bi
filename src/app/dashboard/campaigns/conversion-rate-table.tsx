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
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ConversionRateRow } from "./query";
import { cn } from "@/lib/utils";

const columns: ColumnDef<ConversionRateRow>[] = [
  {
    accessorKey: "campaignName",
    header: "Campaign",
    cell: ({ row }) => (
      <span className="font-medium" title={row.original.campaignId}>
        {row.original.campaignName ?? row.original.campaignId}
      </span>
    ),
  },
  {
    accessorKey: "campaignType",
    header: "Type",
    cell: ({ getValue }) => (
      <span className="text-xs text-(--color-text-muted)">{(getValue() as string | null) ?? "—"}</span>
    ),
  },
  {
    accessorKey: "engagedContacts",
    header: "Engaged",
    cell: ({ getValue }) => <span className="tabular-nums">{Number(getValue()).toLocaleString()}</span>,
  },
  {
    accessorKey: "sqlContributors",
    header: "→ SQL",
    cell: ({ getValue }) => <span className="tabular-nums">{Number(getValue()).toLocaleString()}</span>,
  },
  {
    accessorKey: "conversionRate",
    header: "Conv. rate",
    cell: ({ getValue }) => {
      const v = Number(getValue());
      const pct = (v * 100).toFixed(1);
      return (
        <span
          className={cn(
            "tabular-nums",
            v >= 0.05 ? "text-(--color-success)" : v >= 0.01 ? "" : "text-(--color-text-muted)",
          )}
        >
          {pct}%
        </span>
      );
    },
  },
];

export function ConversionRateTable({ data }: { data: ConversionRateRow[] }) {
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "conversionRate", desc: true },
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
                No campaigns match the current filters.
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
