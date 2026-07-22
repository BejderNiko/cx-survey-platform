"use client";

import { useState, useTransition } from "react";
import { Button, Textarea } from "@/components/ui";
import { addComment, duplicateStudy, publishStudy, setStudyStatus } from "../actions";

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
                setMsg(`Version ${res.version} er publiceret. Studiet er i gang.`);
              }
            })
          }
        >
          {status === "live" ? "Publicér ny version" : "Publicér"}
        </Button>
      )}
      {canClose && status === "live" && (
        <Button variant="secondary" disabled={pending}
          onClick={() => startTransition(() => setStudyStatus(studyId, "paused"))}>
          Sæt på pause
        </Button>
      )}
      {canClose && ["live", "paused"].includes(status) && (
        <Button variant="secondary" disabled={pending}
          onClick={() => startTransition(() => setStudyStatus(studyId, "closed"))}>
          Afslut
        </Button>
      )}
      {canClose && status === "paused" && (
        <Button variant="secondary" disabled={pending}
          onClick={() => startTransition(() => setStudyStatus(studyId, "live"))}>
          Genoptag
        </Button>
      )}
      {canCreate && (
        <Button variant="secondary" disabled={pending} onClick={() => startTransition(() => duplicateStudy(studyId))}>
          Duplikér
        </Button>
      )}
      {msg && <span className="text-sm text-success">{msg}</span>}
      {problems.length > 0 && (
        <div role="alert" className="w-full rounded-lg border border-danger/30 bg-red-50 px-3 py-2 text-sm text-danger">
          <p className="font-medium">Kan ikke publicere:</p>
          <ul className="list-disc pl-5">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

export function CommentForm({ entityType, entityId, path }: { entityType: string; entityId: string; path: string }) {
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex gap-2">
      <Textarea rows={1} placeholder="Skriv en kommentar…" value={body} onChange={(e) => setBody(e.target.value)} aria-label="Kommentar" />
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
        Send
      </Button>
    </div>
  );
}
