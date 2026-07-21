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
import { Badge, Button, Input, cn } from "@/components/ui";
import { bulkTag } from "./actions";

export interface PanelRow {
  id: string;
  externalId: string | null;
  name: string;
  email: string;
  language: string;
  birthYear: number | null;
  gender: string;
  city: string;
  customerStatus: string;
  lifecycle: string;
  tags: string[];
  hasConsent: boolean;
}

const col = createColumnHelper<PanelRow>();

const LIFECYCLE_TONE: Record<string, string> = {
  active: "green",
  invited: "blue",
  paused: "amber",
  unsubscribed: "amber",
  bounced: "red",
  blocked: "red",
  anonymized: "gray",
  archived: "gray",
};

export function PanelTable({ rows, canEdit, locale }: { rows: PanelRow[]; canEdit: boolean; locale: string }) {
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
          aria-label="Select all"
          checked={table.getIsAllRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={`Select ${row.original.name}`}
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
        />
      ),
    }),
    col.accessor("name", {
      header: "Name",
      cell: (info) => (
        <Link href={`/panel/${info.row.original.id}`} className="font-medium text-accent hover:underline">
          {info.getValue()}
        </Link>
      ),
    }),
    col.accessor("email", { header: "Email" }),
    col.accessor("lifecycle", {
      header: "Lifecycle",
      cell: (info) => <Badge tone={LIFECYCLE_TONE[info.getValue()] ?? "gray"}>{info.getValue()}</Badge>,
    }),
    col.accessor("hasConsent", {
      header: "Consent",
      cell: (info) => (info.getValue() ? <Badge tone="green">granted</Badge> : <Badge tone="red">missing</Badge>),
    }),
    col.accessor("customerStatus", { header: "Status" }),
    col.accessor("city", { header: "City" }),
    col.accessor("language", { header: "Lang" }),
    col.accessor("birthYear", { header: "Born", cell: (info) => info.getValue() ?? "—" }),
    col.accessor("tags", {
      header: "Tags",
      enableSorting: false,
      cell: (info) => (
        <span className="flex flex-wrap gap-1">
          {info.getValue().map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </span>
      ),
    }),
  ];

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (r) => r.id,
  });

  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);

  return (
    <div>
      {canEdit && selectedIds.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-line bg-accent-soft/60 px-3 py-2">
          <span className="text-xs font-medium">{selectedIds.length} selected</span>
          <Input
            aria-label="Tag name"
            placeholder="tag name"
            value={tagName}
            onChange={(e) => setTagName(e.target.value)}
            className="h-7 w-40 text-xs"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={pending || !tagName.trim()}
            onClick={() =>
              startTransition(async () => {
                const res = await bulkTag(selectedIds, tagName);
                setMessage(`Tagged ${res.tagged} panelists with '${tagName.trim().toLowerCase()}'.`);
                setRowSelection({});
                setTagName("");
              })
            }
          >
            Add tag
          </Button>
          {message && <span className="text-xs text-muted">{message}</span>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className={cn(
                      "border-b border-line px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted whitespace-nowrap",
                      h.column.getCanSort() && "cursor-pointer select-none",
                    )}
                    onClick={h.column.getToggleSortingHandler()}
                    aria-sort={
                      h.column.getIsSorted() === "asc" ? "ascending"
                      : h.column.getIsSorted() === "desc" ? "descending" : undefined
                    }
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === "asc" ? " ↑" : h.column.getIsSorted() === "desc" ? " ↓" : ""}
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
                <td colSpan={10} className="px-3 py-6 text-center text-muted">
                  No panelists match the filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
