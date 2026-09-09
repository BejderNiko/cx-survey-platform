"use client";

import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, Input, cn } from "@/components/ui";
import { bulkTag } from "./actions";

export interface PanelRow {
  id: string;
  name: string;
  email: string;
  car: string;
  age: string;
  products: string;
}

const col = createColumnHelper<PanelRow>();

export function PanelTable({ rows, canEdit }: { rows: PanelRow[]; canEdit: boolean }) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [tagName, setTagName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const columns = [
    col.display({
      id: "select",
      header: ({ table }) => (
        <input
          type="checkbox"
          aria-label="Vælg alle"
          checked={table.getIsAllRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={"Vælg " + row.original.name}
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
        />
      ),
    }),
    col.accessor("name", {
      header: "Navn",
      cell: (info) => (
        <div className="min-w-40">
          <Link href={"/panel/" + info.row.original.id} className="font-medium text-accent hover:underline">
            {info.getValue()}
          </Link>
          <Link href={"/panel/" + info.row.original.id} className="mt-1 block text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-accent hover:underline">
            View profile
          </Link>
        </div>
      ),
    }),
    col.accessor("email", { header: "E-mail" }),
    col.accessor("car", { header: "Bil" }),
    col.accessor("age", { header: "Alder" }),
    col.accessor("products", {
      header: "Produkter ved OK",
      enableSorting: false,
      cell: (info) => <span className="block min-w-40 whitespace-normal">{info.getValue()}</span>,
    }),
  ];

  // TanStack Table returns callback-rich state that React Compiler intentionally does not memoize.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id,
  });

  const selectedIds = Object.keys(rowSelection).filter((key) => rowSelection[key]);

  return (
    <div>
      {canEdit && selectedIds.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-accent-soft/60 px-3 py-2">
          <span className="text-xs font-medium">{selectedIds.length} valgt</span>
          <Input
            aria-label="Tagnavn"
            placeholder="tagnavn"
            value={tagName}
            onChange={(event) => setTagName(event.target.value)}
            className="h-7 w-40 text-xs"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={pending || !tagName.trim()}
            onClick={() =>
              startTransition(async () => {
                const result = await bulkTag(selectedIds, tagName);
                setMessage(String(result.tagged) + " panelister fik tagget '" + tagName.trim().toLowerCase() + "'.");
                setRowSelection({});
                setTagName("");
              })
            }
          >
            Tilføj tag
          </Button>
          {message && <span className="text-xs text-muted">{message}</span>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={cn(
                      "border-b border-line px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap",
                      header.column.getCanSort() && "cursor-pointer select-none",
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                    aria-sort={
                      header.column.getIsSorted() === "asc" ? "ascending"
                      : header.column.getIsSorted() === "desc" ? "descending" : undefined
                    }
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === "asc" ? " ↑" : header.column.getIsSorted() === "desc" ? " ↓" : ""}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className={cn(row.getIsSelected() && "bg-accent-soft/40")}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="border-b border-line/60 px-3 py-1.5 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted">
                  Ingen panelister matcher filtrene.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
