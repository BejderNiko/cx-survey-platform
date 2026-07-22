"use client";

import { useState, useTransition } from "react";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { createInsight, setInsightStatus } from "./actions";

export function InsightComposer({
  studies,
  runs,
}: {
  studies: { id: string; title: string }[];
  runs: { id: string; label: string }[];
}) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [decision, setDecision] = useState("");
  const [tags, setTags] = useState("");
  const [studyId, setStudyId] = useState("");
  const [runId, setRunId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor="in-title">Titel</Label>
          <Input id="in-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="in-tags">Tags (adskilt med komma)</Label>
          <Input id="in-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="nps, kundeservice" />
        </div>
      </div>
      <div>
        <Label htmlFor="in-summary">Fund</Label>
        <Textarea id="in-summary" rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="in-decision">Beslutning / anbefaling (valgfri)</Label>
        <Input id="in-decision" value={decision} onChange={(e) => setDecision(e.target.value)} />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label htmlFor="in-study">Tilknyt studie (dokumentation)</Label>
          <Select id="in-study" value={studyId} onChange={(e) => setStudyId(e.target.value)}>
            <option value="">intet</option>
            {studies.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="in-run">Tilknyt analysekørsel</Label>
          <Select id="in-run" value={runId} onChange={(e) => setRunId(e.target.value)}>
            <option value="">ingen</option>
            {runs.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </Select>
        </div>
        <Button
          disabled={pending || !title.trim() || !summary.trim()}
          onClick={() =>
            startTransition(async () => {
              const links = [
                ...(studyId ? [{ entityType: "study", entityId: studyId }] : []),
                ...(runId ? [{ entityType: "analysis_run", entityId: runId }] : []),
              ];
              await createInsight({
                title, summary, decision,
                tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
                links,
              });
              setTitle(""); setSummary(""); setDecision(""); setTags("");
              setMessage("Indsigten er oprettet.");
            })
          }
        >
          Opret indsigt
        </Button>
        {message && <span className="text-sm text-success">{message}</span>}
      </div>
    </div>
  );
}

export function InsightStatusButtons({ insightId, status }: { insightId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex gap-1">
      {status !== "validated" && (
        <Button size="sm" variant="secondary" disabled={pending}
          onClick={() => startTransition(() => setInsightStatus(insightId, "validated"))}>
          Markér som valideret
        </Button>
      )}
      {status !== "archived" && (
        <Button size="sm" variant="ghost" disabled={pending}
          onClick={() => startTransition(() => setInsightStatus(insightId, "archived"))}>
          Arkivér
        </Button>
      )}
    </div>
  );
}
