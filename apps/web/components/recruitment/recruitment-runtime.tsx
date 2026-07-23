"use client";

import { useState } from "react";
import { Button, Input, Textarea, cn } from "@/components/ui";
import type { RecruitmentQuestion } from "@/lib/data/recruitment";

interface Props {
  token: string;
  pageTitle: string;
  pageContent: string;
  screeningEnabled: boolean;
  screeningQuestionContent: string;
  screeningContinueLabel: string;
  screeningEndLabel: string;
  screeningEndContent: string;
  thankYouContent: string;
  questions: RecruitmentQuestion[];
}

/** Public recruitment runtime: optional screening gate, then name/email + questions, then thank-you. */
export function RecruitmentRuntime({
  token, pageTitle, pageContent, screeningEnabled, screeningQuestionContent,
  screeningContinueLabel, screeningEndLabel, screeningEndContent, thankYouContent, questions,
}: Props) {
  const [phase, setPhase] = useState<"screening" | "form" | "screened_out" | "done">(
    screeningEnabled ? "screening" : "form",
  );
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [consented, setConsented] = useState(false);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    if (!consented) {
      setError("Du skal acceptere, at dine oplysninger må gemmes, før du kan sende.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/recruit/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, firstName, email, answers }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error && typeof body.error === "string" && !["unknown_token"].includes(body.error)
          ? body.error
          : "Kunne ikke gemme din tilmelding. Prøv igen.");
        return;
      }
      setPhase("done");
    } catch {
      setError("Kunne ikke gemme din tilmelding. Tjek din forbindelse og prøv igen.");
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === "screening") {
    return (
      <div className="rounded-lg border border-line bg-surface p-6">
        <p className="whitespace-pre-wrap text-sm">{screeningQuestionContent}</p>
        <div className="mt-5 flex gap-2">
          <Button onClick={() => setPhase("form")}>{screeningContinueLabel}</Button>
          <Button variant="secondary" onClick={() => setPhase("screened_out")}>{screeningEndLabel}</Button>
        </div>
      </div>
    );
  }

  if (phase === "screened_out") {
    return (
      <div className="rounded-lg border border-line bg-surface p-6 text-center">
        <p className="whitespace-pre-wrap text-sm">{screeningEndContent || "Tak for din tid."}</p>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="rounded-lg border border-line bg-surface p-6 text-center">
        <p className="whitespace-pre-wrap text-base">{thankYouContent || "Tak, fordi du vil være med."}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-6">
      {pageTitle && <h1 className="mb-2 text-lg font-semibold">{pageTitle}</h1>}
      {pageContent && <p className="mb-4 whitespace-pre-wrap text-sm text-muted">{pageContent}</p>}

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted" htmlFor="rt-name">Navn *</label>
          <Input id="rt-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted" htmlFor="rt-email">E-mail *</label>
          <Input id="rt-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>

        {questions.map((q) => (
          <QuestionField
            key={q.id}
            question={q}
            value={answers[q.id]}
            onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
          />
        ))}

        <label className="flex items-start gap-2 pt-2 text-xs text-muted">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={consented}
            onChange={(e) => setConsented(e.target.checked)}
          />
          Jeg accepterer, at mine oplysninger gemmes og bruges til at kontakte mig om undersøgelser.
          Jeg kan til enhver tid trække mit samtykke tilbage.
        </label>

        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button
          className="w-full"
          disabled={submitting || !firstName.trim() || !email.trim() || !consented}
          onClick={submit}
        >
          {submitting ? "Sender…" : "Tilmeld dig"}
        </Button>
      </div>
    </div>
  );
}

function QuestionField({
  question, value, onChange,
}: {
  question: RecruitmentQuestion;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = `${question.label}${question.required ? " *" : ""}`;
  switch (question.fieldType) {
    case "number":
      return (
        <Field label={label} htmlFor={`rt-${question.id}`}>
          <Input id={`rt-${question.id}`} type="number" value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)} required={question.required} />
        </Field>
      );
    case "date":
      return (
        <Field label={label} htmlFor={`rt-${question.id}`}>
          <Input id={`rt-${question.id}`} type="date" value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)} required={question.required} />
        </Field>
      );
    case "boolean":
      return (
        <Field label={label}>
          <div className="flex gap-2" role="radiogroup" aria-label={question.label}>
            {[{ v: true, l: "Ja" }, { v: false, l: "Nej" }].map(({ v, l }) => (
              <button key={l} type="button" role="radio" aria-checked={value === v}
                onClick={() => onChange(v)}
                className={cn(
                  "h-9 flex-1 rounded-md border text-sm font-medium cursor-pointer",
                  value === v ? "border-accent bg-accent text-white" : "border-line bg-surface hover:border-accent/50",
                )}>
                {l}
              </button>
            ))}
          </div>
        </Field>
      );
    case "select":
      return (
        <Field label={label}>
          <div className="space-y-1.5" role="radiogroup" aria-label={question.label}>
            {question.options.map((opt) => (
              <label key={opt} className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm",
                value === opt ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-accent/40",
              )}>
                <input type="radio" name={question.id} checked={value === opt} onChange={() => onChange(opt)} />
                {opt}
              </label>
            ))}
          </div>
        </Field>
      );
    case "multi_select": {
      const arr = (value as string[]) ?? [];
      return (
        <Field label={label}>
          <div className="space-y-1.5">
            {question.options.map((opt) => {
              const checked = arr.includes(opt);
              return (
                <label key={opt} className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm",
                  checked ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-accent/40",
                )}>
                  <input type="checkbox" checked={checked}
                    onChange={() => onChange(checked ? arr.filter((x) => x !== opt) : [...arr, opt])} />
                  {opt}
                </label>
              );
            })}
          </div>
        </Field>
      );
    }
    default:
      return (
        <Field label={label} htmlFor={`rt-${question.id}`}>
          {question.fieldType === "text" && question.label.length > 60 ? (
            <Textarea id={`rt-${question.id}`} rows={3} value={(value as string) ?? ""}
              onChange={(e) => onChange(e.target.value)} required={question.required} />
          ) : (
            <Input id={`rt-${question.id}`} value={(value as string) ?? ""}
              onChange={(e) => onChange(e.target.value)} required={question.required} />
          )}
        </Field>
      );
  }
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted" htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}
