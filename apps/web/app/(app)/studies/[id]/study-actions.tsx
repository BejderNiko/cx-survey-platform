"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { deleteStudy, duplicateStudy, publishStudy, setStudyStatus } from "../actions";

export function StudyActions({
  studyId, status, canPublish, canClose, canCreate,
  canDelete,
}: {
  studyId: string; status: string; canPublish: boolean; canClose: boolean; canCreate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

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
      {canClose && status !== "archived" && (
        <Button variant="secondary" disabled={pending}
          onClick={() => startTransition(() => setStudyStatus(studyId, "archived"))}>
          Arkivér
        </Button>
      )}
      {canDelete && (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => {
            if (!window.confirm("Slet denne kladde permanent? Handlingen kan ikke fortrydes.")) return;
            startTransition(async () => {
              setActionError(null);
              const res = await deleteStudy(studyId);
              if (res.ok) {
                router.push("/studies");
                router.refresh();
                return;
              }
              setActionError(res.reason);
            });
          }}
        >
          Slet studie
        </Button>
      )}
      {actionError && (
        <span role="alert" className="text-sm text-danger">
          {actionError}
        </span>
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
