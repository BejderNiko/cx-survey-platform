"use client";

import { useState, useTransition } from "react";
import { Button, Input, Label, Select, Textarea } from "@/components/ui";
import { addComment, duplicateStudy, publishStudy, setStudyStatus } from "../actions";
import { createPanelInvite, createPublicLink } from "../../distributions/actions";

export function StudyActions({
  studyId, status, canPublish, canClose, canCreate,
}: {
  studyId: string; status: string; canPublish: boolean; canClose: boolean; canCreate: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canPublish && ["draft", "review", "live", "paused"].includes(status) && (
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setMsg(null);
              const res = await publishStudy(studyId);
              if (!res.ok) {
                setProblems(res.problems);
              } else {
                setProblems([]);
                setMsg(`Published version ${res.version}. The study is live.`);
              }
            })
          }
        >
          {status === "live" ? "Publish new version" : "Publish"}
        </Button>
      )}
      {canClose && status === "live" && (
        <Button variant="secondary" disabled={pending}
          onClick={() => startTransition(() => setStudyStatus(studyId, "paused"))}>
          Pause
        </Button>
      )}
      {canClose && ["live", "paused"].includes(status) && (
        <Button variant="secondary" disabled={pending}
          onClick={() => startTransition(() => setStudyStatus(studyId, "closed"))}>
          Close
        </Button>
      )}
      {canClose && status === "paused" && (
        <Button variant="secondary" disabled={pending}
          onClick={() => startTransition(() => setStudyStatus(studyId, "live"))}>
          Resume
        </Button>
      )}
      {canCreate && (
        <Button variant="secondary" disabled={pending} onClick={() => startTransition(() => duplicateStudy(studyId))}>
          Duplicate
        </Button>
      )}
      {msg && <span className="text-sm text-success">{msg}</span>}
      {problems.length > 0 && (
        <div role="alert" className="w-full rounded-md border border-danger/30 bg-red-50 px-3 py-2 text-sm text-danger">
          <p className="font-medium">Cannot publish:</p>
          <ul className="list-disc pl-5">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

export function CreateDistributionForms({
  studyId,
  segments,
}: {
  studyId: string;
  segments: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [linkName, setLinkName] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [method, setMethod] = useState<"all" | "random">("random");
  const [sampleSize, setSampleSize] = useState(50);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-48">
          <Label htmlFor="dl-name">Public link name</Label>
          <Input id="dl-name" value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="Public link" />
        </div>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              try {
                const res = await createPublicLink(studyId, linkName);
                setResult(`Public link created: ${res.url}`);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to create link.");
              }
            })
          }
        >
          Create public link
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="w-48">
          <Label htmlFor="di-name">Invitation name</Label>
          <Input id="di-name" value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Panel invitation" />
        </div>
        <div>
          <Label htmlFor="di-seg">Segment</Label>
          <Select id="di-seg" value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
            <option value="">All active panelists</option>
            {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="di-method">Selection</Label>
          <Select id="di-method" value={method} onChange={(e) => setMethod(e.target.value as "all" | "random")}>
            <option value="random">Random sample (seeded)</option>
            <option value="all">All eligible</option>
          </Select>
        </div>
        {method === "random" && (
          <div className="w-24">
            <Label htmlFor="di-size">Sample size</Label>
            <Input id="di-size" type="number" min={1} value={sampleSize}
              onChange={(e) => setSampleSize(Number(e.target.value))} />
          </div>
        )}
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              try {
                const res = await createPanelInvite({
                  studyId, name: inviteName, segmentId: segmentId || null, method,
                  sampleSize: method === "random" ? sampleSize : undefined,
                });
                setResult(
                  `Invited ${res.invited} of ${res.candidates} candidates (${res.eligible} eligible after governance; excluded: ${
                    Object.entries(res.excluded).map(([k, v]) => `${k}=${v}`).join(", ") || "none"
                  }). Messages are in the simulated outbox.`,
                );
              } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to create invitations.");
              }
            })
          }
        >
          Send invitations (simulated)
        </Button>
      </div>
      {result && <p className="text-sm text-success">{result}</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}

export function CommentForm({ entityType, entityId, path }: { entityType: string; entityId: string; path: string }) {
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex gap-2">
      <Textarea rows={1} placeholder="Add a comment…" value={body} onChange={(e) => setBody(e.target.value)} aria-label="Comment" />
      <Button
        variant="secondary"
        disabled={pending || !body.trim()}
        onClick={() =>
          startTransition(async () => {
            await addComment(entityType, entityId, body, path);
            setBody("");
          })
        }
      >
        Post
      </Button>
    </div>
  );
}
