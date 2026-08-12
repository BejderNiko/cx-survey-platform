"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import { createFeatureRequest, updateFeatureRequest } from "./actions";

type Row = { id: string; title: string; description: string; status: string; ownerId: string | null; ownerName: string | null; creator: string; updatedAt: string; events: { id: string; type: string; actor: string | null; at: string; details: Record<string, unknown> }[] };

export function FeatureRequestInbox({ rows, members, canManage }: { rows: Row[]; members: { id: string; name: string }[]; canManage: boolean }) {
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  return <div className="space-y-4">
    <Card title="Ny feature request">
      <div className="grid gap-3 sm:grid-cols-2"><label><Label>Titel</Label><Input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} /></label><label className="sm:col-span-2"><Label>Beskrivelse</Label><Textarea value={description} maxLength={5000} rows={4} onChange={(event) => setDescription(event.target.value)} /></label></div>
      <div className="mt-3 flex items-center gap-3"><Button disabled={pending} onClick={() => startTransition(async () => { const result = await createFeatureRequest({ title, description }); setMessage(result.ok ? "Feature request oprettet." : result.error); if (result.ok) { setTitle(""); setDescription(""); } })}>Opret</Button><span className="text-xs text-muted">Ingen attachments accepteres; 160/5.000 tegn.</span></div>
      {message && <p role="status" className="mt-2 text-sm">{message}</p>}
    </Card>
    {rows.map((row) => <Card key={row.id} title={<span className="flex items-center gap-2"><Badge>{row.status}</Badge>{row.title}</span>}>
      <p className="whitespace-pre-wrap text-sm">{row.description}</p><p className="mt-2 text-xs text-muted">Oprettet af {row.creator} · opdateret {row.updatedAt}</p>
      {canManage && <div className="mt-3 flex flex-wrap gap-2"><Select defaultValue={row.status} aria-label="Status" onChange={(event) => startTransition(async () => setMessage((await updateFeatureRequest({ id: row.id, status: event.target.value, ownerId: row.ownerId })).ok ? "Status opdateret." : "Status kunne ikke opdateres."))}>{["new","planned","in_progress","done","declined"].map((status) => <option key={status}>{status}</option>)}</Select><Select defaultValue={row.ownerId ?? ""} aria-label="Ejer" onChange={(event) => startTransition(async () => setMessage((await updateFeatureRequest({ id: row.id, status: row.status, ownerId: event.target.value || null })).ok ? "Ejer opdateret." : "Ejer kunne ikke opdateres."))}><option value="">Ingen ejer</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</Select></div>}
      <details className="mt-3 text-xs"><summary className="cursor-pointer">Audit trail ({row.events.length})</summary><ul className="mt-2 space-y-1">{row.events.map((event) => <li key={event.id}>{event.at} · {event.type} · {event.actor ?? "system"} · {JSON.stringify(event.details)}</li>)}</ul></details>
    </Card>)}
    {rows.length === 0 && <Card><p className="text-sm text-muted">Ingen feature requests.</p></Card>}
  </div>;
}
