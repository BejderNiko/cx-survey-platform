"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Select } from "@/components/ui";
import { createDatasetFromStudy } from "./actions";

export function BuildDatasetButton({ studies }: { studies: { id: string; title: string }[] }) {
  const [studyId, setStudyId] = useState(studies[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select aria-label="Study" value={studyId} onChange={(e) => setStudyId(e.target.value)}>
        {studies.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
      </Select>
      <Button
        disabled={pending || !studyId}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              const res = await createDatasetFromStudy(studyId);
              router.push(`/analytics/datasets/${res.datasetId}`);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Failed to build the dataset.");
            }
          })
        }
      >
        {pending ? "Building…" : "Build dataset"}
      </Button>
      {error && <span className="text-sm text-danger">{error}</span>}
    </div>
  );
}
