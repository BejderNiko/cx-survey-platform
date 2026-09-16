"use client";

import { useState, useTransition } from "react";
import type { InstrumentDefinition } from "@ok/domain";
import { Button, Textarea } from "@/components/ui";
import { generateSurveyDraft } from "../../actions";

type GeneratedDraft = {
  definition: InstrumentDefinition;
  source: string;
  notice: string;
};

export function DraftGenerator({
  studyId,
  onApply,
}: {
  studyId: string;
  onApply: (definition: InstrumentDefinition) => void;
}) {
  const [brief, setBrief] = useState("");
  const [generated, setGenerated] = useState<GeneratedDraft | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [pending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      setMessage(null);
      setApplied(false);
      const result = await generateSurveyDraft(studyId, brief);
      if (!result.ok) {
        setGenerated(null);
        setMessage(result.error);
        return;
      }
      setGenerated({ definition: result.definition, source: result.source, notice: result.notice });
    });
  }

  return (
    <div className="rounded-lg border border-cyan-200 bg-cyan-50/60 px-3 py-3">
      <div>
        <p className="text-xs font-semibold text-slate-800">Generate survey draft</p>
        <p className="mt-0.5 text-[11px] text-slate-600">Describe goal, audience and decisions. Review generated questions before applying them to V1.</p>
      </div>
      <Textarea
        className="mt-3 bg-white"
        rows={3}
        value={brief}
        onChange={(event) => setBrief(event.target.value)}
        placeholder="Example: Test whether new customers understand our onboarding flow."
        aria-label="Survey brief"
        maxLength={2000}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" disabled={pending || !brief.trim()} onClick={generate}>
          {pending ? "Generating..." : "Generate draft"}
        </Button>
        {generated && (
          <Button size="sm" disabled={applied} onClick={() => { onApply(generated.definition); setApplied(true); }}>
            {applied ? "Applied to V1 draft" : "Apply to V1 draft"}
          </Button>
        )}
      </div>
      {generated && <p role="status" className="mt-2 text-[11px] text-slate-600">{generated.notice}</p>}
      {message && <p role="alert" className="mt-2 text-xs text-danger">{message}</p>}
    </div>
  );
}