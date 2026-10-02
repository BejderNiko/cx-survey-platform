"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge, Button, Card, EmptyState, Input, Label, Select, Textarea } from "@/components/ui";
import { createFeatureRequest, updateFeatureRequest } from "./actions";

type Event = { id: string; type: string; actor: string | null; at: string; details: Record<string, unknown> };
type Row = {
  id: string;
  title: string;
  description: string;
  status: string;
  ownerId: string | null;
  ownerName: string | null;
  creator: string;
  updatedAt: string;
  createdAt: string;
  sourcePath: string | null;
  section: string | null;
  sourceType: string;
  targetSnapshot: Record<string, unknown>;
  events: Event[];
};

const STATUS_LABEL: Record<string, string> = {
  new: "Ny",
  planned: "Planlagt",
  in_progress: "I gang",
  done: "Færdig",
  declined: "Afvist",
};
const STATUS_TONE: Record<string, string> = {
  new: "blue",
  planned: "amber",
  in_progress: "accent",
  done: "green",
  declined: "red",
};

export function FeatureRequestInbox({ rows, members, canManage }: { rows: Row[]; members: { id: string; name: string }[]; canManage: boolean }) {
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const visibleRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("da");
    return rows.filter((row) => {
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const haystack = `${row.title} ${row.description} ${row.creator} ${row.sourcePath ?? ""}`.toLocaleLowerCase("da");
      return matchesStatus && (!normalized || haystack.includes(normalized));
    });
  }, [query, rows, statusFilter]);

  function submit() {
    startTransition(async () => {
      const result = await createFeatureRequest({ title, description, sourceType: "manual" });
      setMessage(result.ok ? "Feature request oprettet." : result.error);
      if (result.ok) {
        setTitle("");
        setDescription("");
      }
    });
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card
        title="Existing feature requests"
        actions={<Badge tone="accent">{visibleRows.length} of {rows.length}</Badge>}
      >
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px]">
          <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search feature requests" aria-label="Search feature requests" />
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
            <option value="all">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </div>

        <div className="mt-4 space-y-3">
          {visibleRows.map((row) => (
            <article key={row.id} className="rounded-xl border border-line bg-surface-raised p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={STATUS_TONE[row.status] ?? "gray"}>{STATUS_LABEL[row.status] ?? row.status}</Badge>
                    <Badge tone={row.sourceType === "feedback" ? "accent" : "gray"}>{row.sourceType === "feedback" ? "Feedback" : "Manual"}</Badge>
                  </div>
                  <h3 className="mt-2 text-base font-semibold text-heading">{row.title}</h3>
                </div>
                <span className="text-xs text-muted">{row.updatedAt}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{row.description}</p>
              <p className="mt-3 text-xs text-muted">Created by {row.creator}{row.sourcePath ? ` · ${row.sourcePath}` : ""}{row.section ? ` · ${row.section}` : ""}</p>

              {row.sourceType === "feedback" && (
                <details className="mt-3 rounded-lg border border-line bg-surface px-3 py-2 text-xs">
                  <summary className="cursor-pointer font-medium text-heading">Captured UI area</summary>
                  <p className="mt-2 text-muted">Feedback came from the in-app capture tool. The selection stays attached to this request.</p>
                  <pre className="mt-2 max-h-40 overflow-auto rounded bg-background p-2">{JSON.stringify(row.targetSnapshot, null, 2)}</pre>
                  <button type="button" className="mt-2 underline" onClick={() => navigator.clipboard.writeText(`Feature request: ${row.description}\nPage: ${row.sourcePath ?? "unknown"}\nSection: ${row.section ?? "unknown"}\nElement: ${JSON.stringify(row.targetSnapshot)}`)}>Copy request context</button>
                </details>
              )}

              {canManage && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <label><Label>Status</Label><Select className="w-full" value={row.status} onChange={(event) => startTransition(async () => { const result = await updateFeatureRequest({ id: row.id, status: event.target.value, ownerId: row.ownerId }); setMessage(result.ok ? "Status opdateret." : result.error); })}>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>
                  <label><Label>Owner</Label><Select className="w-full" value={row.ownerId ?? ""} onChange={(event) => startTransition(async () => { const result = await updateFeatureRequest({ id: row.id, status: row.status, ownerId: event.target.value || null }); setMessage(result.ok ? "Owner opdateret." : result.error); })}><option value="">No owner</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</Select></label>
                </div>
              )}

              <details className="mt-3 text-xs">
                <summary className="cursor-pointer text-muted">Audit trail ({row.events.length})</summary>
                <ul className="mt-2 space-y-1 text-muted">{row.events.map((event) => <li key={event.id}>{event.at} · {event.type} · {event.actor ?? "system"} · {JSON.stringify(event.details)}</li>)}</ul>
              </details>
            </article>
          ))}
          {visibleRows.length === 0 && <EmptyState title="No feature requests match" hint="Change search or status filter, or add a new request." />}
        </div>
      </Card>

      <Card title="Add feature request">
        <p className="text-sm leading-6 text-muted">Add requests here. Feedback captured elsewhere in platform appears in same overview automatically.</p>
        <div className="mt-4 space-y-3">
          <label><Label>Title</Label><Input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder="Short, specific title" /></label>
          <label><Label>Description</Label><Textarea value={description} maxLength={5000} rows={7} onChange={(event) => setDescription(event.target.value)} placeholder="What should change, and why?" /></label>
          <Button disabled={pending || title.trim().length < 3 || !description.trim()} onClick={submit}>{pending ? "Saving…" : "Add request"}</Button>
          {message && <p role="status" className="text-sm text-muted">{message}</p>}
        </div>
      </Card>
    </div>
  );
}