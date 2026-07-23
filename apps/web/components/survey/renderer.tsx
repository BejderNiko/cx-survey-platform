"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  allQuestions,
  lt,
  nextStep,
  type InstrumentDefinition,
  type Locale,
  type Question,
  type StimulusAsset,
} from "@ok/domain";
import { Button, Input, Textarea, cn } from "@/components/ui";

/**
 * Respondent runtime: renders a published instrument one question at a time,
 * honoring visibleIf/branch logic. Used in live mode (public/tokenized links)
 * and preview mode (builder, no data written).
 */

export interface AnswerPayload {
  code: string;
  type: string;
  value: unknown;
}

export interface InteractionPayload {
  code: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export function SurveyRenderer({
  definition,
  locale: initialLocale,
  mode,
  onComplete,
  studyTitle,
  assetToken,
}: {
  definition: InstrumentDefinition;
  locale?: Locale;
  mode: "preview" | "live";
  studyTitle?: string;
  assetToken?: string;
  onComplete?: (result: {
    status: "completed" | "disqualified";
    answers: AnswerPayload[];
    interactions: InteractionPayload[];
  }) => Promise<void> | void;
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale ?? definition.defaultLanguage);
  const [phase, setPhase] = useState<"intro" | "question" | "done" | "disqualified">("intro");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [history, setHistory] = useState<string[]>([]);
  const [current, setCurrent] = useState<Question | null>(null);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const interactionsRef = useRef<InteractionPayload[]>([]);

  const questions = useMemo(() => allQuestions(definition), [definition]);
  const total = questions.length;

  const goNext = useCallback(
    async (fromCode: string | null, currentAnswers: Record<string, unknown>) => {
      const step = nextStep(definition, fromCode, currentAnswers);
      if (step.kind === "question") {
        setCurrent(step.question);
        setPhase("question");
      } else {
        const status = step.kind === "disqualified" ? "disqualified" : "completed";
        // Submit BEFORE showing the thank-you screen so navigating away
        // immediately afterwards cannot lose the response.
        if (mode === "live" && onComplete) {
          setSubmitting(true);
          setValidationMsg(null);
          const payload = questions
            .filter((q) => currentAnswers[q.code] !== undefined)
            .map((q) => ({ code: q.code, type: q.type, value: currentAnswers[q.code] }));
          try {
            await onComplete({ status, answers: payload, interactions: interactionsRef.current });
          } catch {
            setValidationMsg(
              locale === "da"
                ? "Svaret kunne ikke gemmes. Kontrollér forbindelsen og prøv igen."
                : "The response could not be saved. Check your connection and try again.",
            );
            return;
          } finally {
            setSubmitting(false);
          }
        }
        setPhase(status === "disqualified" ? "disqualified" : "done");
      }
    },
    [definition, locale, mode, onComplete, questions],
  );

  const answerValue = current ? answers[current.code] : undefined;
  const currentContext = current
    ? current.contextOverride === undefined ? definition.contextStimulus : current.contextOverride
    : undefined;


  function isAnswered(q: Question, v: unknown): boolean {
    if (v === undefined || v === null || v === "") return false;
    if (Array.isArray(v) && v.length === 0) return false;
    if (q.type === "matrix") {
      const rows = q.rows ?? [];
      const m = (v ?? {}) as Record<string, unknown>;
      return rows.every((r) => m[r.id] !== undefined);
    }
    return true;
  }

  async function next() {
    if (!current) return;
    let currentAnswers = answers;
    if (current.type === "ranking" && currentAnswers[current.code] === undefined) {
      currentAnswers = {
        ...currentAnswers,
        [current.code]: (current.options ?? []).map((option) => option.id),
      };
      setAnswers(currentAnswers);
    }
    if (current.required && !isAnswered(current, currentAnswers[current.code])) {
      setValidationMsg(locale === "da" ? "Dette spørgsmål skal besvares." : "This question requires an answer.");
      return;
    }
    setValidationMsg(null);
    setHistory((historyCodes) => [...historyCodes, current.code]);
    await goNext(current.code, currentAnswers);
  }

  function back() {
    const prev = history[history.length - 1];
    if (!prev) {
      setPhase("intro");
      setCurrent(null);
      return;
    }
    const q = questions.find((qq) => qq.code === prev) ?? null;
    setHistory((h) => h.slice(0, -1));
    setCurrent(q);
    setValidationMsg(null);
  }

  const setAnswer = (value: unknown) => {
    if (!current) return;
    setAnswers((a) => ({ ...a, [current.code]: value }));
    setValidationMsg(null);
  };

  const progress = current
    ? Math.round(((questions.findIndex((q) => q.code === current.code) + 1) / total) * 100)
    : phase === "done" || phase === "disqualified" ? 100 : 0;

  const msg = (key: "intro" | "thankYou" | "disqualified") => lt(definition.messages?.[key], locale);

  return (
    <div className={cn("mx-auto w-full", currentContext ? "max-w-6xl" : "max-w-xl")}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{studyTitle ?? ""}</span>
        {definition.languages.length > 1 && (
          <div className="flex gap-1" role="group" aria-label="Language">
            {definition.languages.map((l) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                className={cn(
                  "rounded px-2 py-0.5 text-xs cursor-pointer",
                  l === locale ? "bg-accent text-white" : "bg-background text-muted hover:text-foreground",
                )}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mb-4 h-1 w-full overflow-hidden rounded bg-background" aria-hidden>
        <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
      </div>

      {phase === "intro" && (
        <div className="rounded-lg border border-line bg-surface p-6 text-center">
          <p className="text-base">{msg("intro") || (locale === "da" ? "Velkommen." : "Welcome.")}</p>
          <Button className="mt-5" onClick={() => goNext(null, answers)} autoFocus>
            {locale === "da" ? "Start" : "Start"}
          </Button>
        </div>
      )}

      {phase === "question" && current && (
        <div className={cn(
          "grid min-w-0 gap-4",
          currentContext && "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start",
        )}>
          {currentContext && (
            <figure className="min-w-0 overflow-hidden rounded-lg border border-line bg-surface p-3 lg:sticky lg:top-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={stimulusUrl(currentContext, assetToken)}
                alt={currentContext.altText}
                className="max-h-[70vh] w-full max-w-full object-contain"
              />
            </figure>
          )}
          <div className="min-w-0 rounded-lg border border-line bg-surface p-5 sm:p-6">
            <fieldset>
              <legend className="text-base font-medium">
                {lt(current.label, locale)}
                {current.required && <span aria-hidden className="text-danger"> *</span>}
              </legend>
              {current.helpText && <p className="mt-1 text-sm text-muted">{lt(current.helpText, locale)}</p>}
              <div className="mt-4">
                <QuestionInput
                  question={current}
                  locale={locale}
                  value={answerValue}
                  onChange={setAnswer}
                  interactions={interactionsRef}
                  assetToken={assetToken}
                />
              </div>
            </fieldset>
            {validationMsg && (
              <p role="alert" className="mt-3 text-sm text-danger">{validationMsg}</p>
            )}
            <div className="mt-5 flex items-center justify-between">
              <Button variant="ghost" onClick={back}>
                {locale === "da" ? "Tilbage" : "Back"}
              </Button>
              <Button onClick={next} disabled={submitting}>
                {locale === "da" ? "Næste" : "Next"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {phase === "done" && (
        <div className="rounded-lg border border-line bg-surface p-6 text-center">
          <p className="text-base">{msg("thankYou") || (locale === "da" ? "Tak for din besvarelse." : "Thank you for your response.")}</p>
          {mode === "preview" && <p className="mt-2 text-xs text-muted">Forhåndsvisning — der blev ikke gemt data.</p>}
        </div>
      )}

      {phase === "disqualified" && (
        <div className="rounded-lg border border-line bg-surface p-6 text-center">
          <p className="text-base">{msg("disqualified") || (locale === "da" ? "Tak for din interesse." : "Thank you for your interest.")}</p>
        </div>
      )}
    </div>
  );
}

function ScaleButtons({
  min, max, value, onChange, minLabel, maxLabel,
}: {
  min: number; max: number; value: unknown; onChange: (v: number) => void;
  minLabel?: string; maxLabel?: string;
}) {
  const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup">
        {values.map((v) => (
          <button
            key={v}
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={cn(
              "h-10 min-w-10 flex-1 rounded-md border text-sm font-medium transition-colors cursor-pointer",
              value === v
                ? "border-accent bg-accent text-white"
                : "border-line bg-surface hover:border-accent/50",
            )}
          >
            {v}
          </button>
        ))}
      </div>
      {(minLabel || maxLabel) && (
        <div className="mt-1 flex justify-between text-xs text-muted">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      )}
    </div>
  );
}

function OptionList({
  question, locale, value, onChange, multi,
}: {
  question: Question; locale: Locale; value: unknown; onChange: (v: unknown) => void; multi: boolean;
}) {
  const selected = multi ? ((value as string[]) ?? []) : value;
  return (
    <div className="space-y-1.5">
      {(question.options ?? []).map((opt) => {
        const checked = multi ? (selected as string[]).includes(opt.id) : selected === opt.id;
        return (
          <label
            key={opt.id}
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2.5 text-sm transition-colors",
              checked ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-accent/40",
            )}
          >
            <input
              type={multi ? "checkbox" : "radio"}
              name={question.code}
              checked={checked}
              onChange={() => {
                if (multi) {
                  const arr = selected as string[];
                  onChange(checked ? arr.filter((x) => x !== opt.id) : [...arr, opt.id]);
                } else {
                  onChange(opt.id);
                }
              }}
            />
            {lt(opt.label, locale)}
          </label>
        );
      })}
    </div>
  );
}

function QuestionInput({
  question, locale, value, onChange, interactions: interactionsRef, assetToken,
}: {
  question: Question;
  locale: Locale;
  value: unknown;
  onChange: (v: unknown) => void;
  interactions: React.RefObject<InteractionPayload[]>;
  assetToken?: string;
}) {
  switch (question.type) {
    case "nps":
      return (
        <ScaleButtons min={0} max={10} value={value} onChange={onChange}
          minLabel={locale === "da" ? "Slet ikke sandsynligt" : "Not at all likely"}
          maxLabel={locale === "da" ? "Meget sandsynligt" : "Extremely likely"} />
      );
    case "csat":
      return (
        <ScaleButtons min={1} max={5} value={value} onChange={onChange}
          minLabel={locale === "da" ? "Meget utilfreds" : "Very dissatisfied"}
          maxLabel={locale === "da" ? "Meget tilfreds" : "Very satisfied"} />
      );
    case "ces":
      return (
        <ScaleButtons min={1} max={7} value={value} onChange={onChange}
          minLabel={locale === "da" ? "Meget svært" : "Very difficult"}
          maxLabel={locale === "da" ? "Meget let" : "Very easy"} />
      );
    case "rating":
      return (
        <ScaleButtons
          min={question.scale?.min ?? 1}
          max={question.scale?.max ?? 5}
          value={value}
          onChange={onChange}
          minLabel={lt(question.scale?.minLabel, locale)}
          maxLabel={lt(question.scale?.maxLabel, locale)}
        />
      );
    case "likert": {
      return (
        <div className="space-y-1.5" role="radiogroup">
          {(question.options ?? []).map((opt) => {
            const v = opt.value ?? opt.id;
            return (
              <label key={opt.id}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm",
                  value === v ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-accent/40",
                )}>
                <input type="radio" name={question.code} checked={value === v} onChange={() => onChange(v)} />
                {lt(opt.label, locale)}
              </label>
            );
          })}
        </div>
      );
    }
    case "single_choice":
      return <OptionList question={question} locale={locale} value={value} onChange={onChange} multi={false} />;
    case "multiple_choice":
      return <OptionList question={question} locale={locale} value={value} onChange={onChange} multi={true} />;
    case "dropdown":
      return (
        <select
          className="h-9 w-full rounded-md border border-line bg-surface px-2 text-sm"
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          aria-label={lt(question.label, locale)}
        >
          <option value="">{locale === "da" ? "Vælg…" : "Choose…"}</option>
          {(question.options ?? []).map((o) => (
            <option key={o.id} value={o.id}>{lt(o.label, locale)}</option>
          ))}
        </select>
      );
    case "short_text":
      return <Input value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} aria-label={lt(question.label, locale)} />;
    case "long_text":
      return <Textarea rows={4} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} aria-label={lt(question.label, locale)} />;
    case "number":
      return (
        <Input
          type="number"
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          aria-label={lt(question.label, locale)}
        />
      );
    case "date":
      return <Input type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} aria-label={lt(question.label, locale)} />;
    case "consent": {
      const yes = locale === "da" ? "Ja" : "Yes";
      const no = locale === "da" ? "Nej" : "No";
      return (
        <div className="flex gap-2" role="radiogroup">
          {[{ v: true, l: yes }, { v: false, l: no }].map(({ v, l }) => (
            <button key={l} role="radio" aria-checked={value === v}
              onClick={() => onChange(v)}
              className={cn(
                "h-10 flex-1 rounded-md border text-sm font-medium cursor-pointer",
                value === v ? "border-accent bg-accent text-white" : "border-line bg-surface hover:border-accent/50",
              )}>
              {l}
            </button>
          ))}
        </div>
      );
    }
    case "ranking": {
      const order = (value as string[]) ?? (question.options ?? []).map((o) => o.id);
      const move = (i: number, dir: -1 | 1) => {
        const next = [...order];
        const j = i + dir;
        if (j < 0 || j >= next.length) return;
        [next[i], next[j]] = [next[j], next[i]];
        onChange(next);
      };
      return (
        <ol className="space-y-1.5">
          {order.map((id, i) => {
            const opt = (question.options ?? []).find((o) => o.id === id);
            return (
              <li key={id} className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-sm">
                <span className="w-5 text-muted">{i + 1}.</span>
                <span className="flex-1">{opt ? lt(opt.label, locale) : id}</span>
                <button aria-label={`Move up`} className="px-1 text-muted hover:text-foreground cursor-pointer" onClick={() => move(i, -1)}>↑</button>
                <button aria-label={`Move down`} className="px-1 text-muted hover:text-foreground cursor-pointer" onClick={() => move(i, 1)}>↓</button>
              </li>
            );
          })}
        </ol>
      );
    }
    case "matrix": {
      const m = ((value as Record<string, unknown>) ?? {});
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th />
                {(question.options ?? []).map((c) => (
                  <th key={c.id} className="px-2 pb-2 text-center text-xs font-medium text-muted">{lt(c.label, locale)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(question.rows ?? []).map((row) => (
                <tr key={row.id} className="border-t border-line/60">
                  <td className="py-2 pr-2">{lt(row.label, locale)}</td>
                  {(question.options ?? []).map((c) => {
                    const v = c.value ?? c.id;
                    return (
                      <td key={c.id} className="text-center">
                        <input
                          type="radio"
                          name={`${question.code}_${row.id}`}
                          aria-label={`${lt(row.label, locale)}: ${lt(c.label, locale)}`}
                          checked={m[row.id] === v}
                          onChange={() => onChange({ ...m, [row.id]: v })}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "preference_test":
      return (
        <PreferenceInput
          key={question.code}
          question={question}
          value={value}
          onChange={onChange}
          assetToken={assetToken}
        />

      );
    case "first_click": {
      const v = value as { x: number; y: number } | undefined;
      const imageUrl = question.stimulus ? stimulusUrl(question.stimulus, assetToken) : question.imageUrl ?? "";
      return (
        <div>
          {question.taskText && (
            <p className="mb-2 rounded-md bg-accent-soft px-3 py-2 text-sm">{lt(question.taskText, locale)}</p>
          )}
          <FirstClickImage
            imageUrl={imageUrl}
            altText={question.stimulus?.altText ?? "Teststimulus"}
            value={v}
            onClickPoint={(pt, meta) => {
              onChange(pt);
              const entry = {
                code: question.code,
                eventType: "first_click",
                payload: { ...pt, ...meta },
              };
              interactionsRef.current = [
                ...interactionsRef.current.filter((e) => e.code !== question.code),
                entry,
              ];
            }}
          />
          <p className="mt-1 text-xs text-muted">
            {v
              ? locale === "da" ? "Klik registreret — du kan klikke igen for at ændre." : "Click recorded — click again to change."
              : locale === "da" ? "Klik på billedet." : "Click on the image."}
          </p>
        </div>
      );
    }
    default:
      return (
        <p className="text-sm text-muted">
          {locale === "da" ? "Spørgsmålstypen understøttes ikke." : "Unsupported question type."}
        </p>
      );
  }
}

function FirstClickImage({
  imageUrl, altText, value, onClickPoint,
}: {
  imageUrl: string;
  altText: string;
  value: { x: number; y: number } | undefined;
  onClickPoint: (pt: { x: number; y: number }, meta: Record<string, unknown>) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const shownAt = useRef(0);
  useEffect(() => {
    shownAt.current = Date.now();
  }, []);
  const [display, setDisplay] = useState<{ x: number; y: number } | null>(null);

  return (
    <div className="relative inline-block max-w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={imageUrl}
        alt={altText}
        className="max-w-full cursor-crosshair rounded-md border border-line"
        onClick={(e) => {
          const img = imgRef.current;
          if (!img) return;
          const rect = img.getBoundingClientRect();
          const relX = (e.clientX - rect.left) / rect.width;
          const relY = (e.clientY - rect.top) / rect.height;
          const x = Math.round(relX * img.naturalWidth);
          const y = Math.round(relY * img.naturalHeight);
          setDisplay({ x: e.clientX - rect.left, y: e.clientY - rect.top });
          onClickPoint(
            { x, y },
            {
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
              elapsedMs: Date.now() - shownAt.current,
            },
          );
        }}
      />
      {display && value && (
        <span
          aria-hidden
          className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent shadow"
          style={{ left: display.x, top: display.y }}
        />
      )}
    </div>
  );
}

function stimulusUrl(asset: StimulusAsset, token?: string): string {
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  return `/api/stimuli/${asset.assetId}${query}`;
}

function PreferenceInput({
  question, value, onChange, assetToken,
}: {
  question: Question;
  value: unknown;
  onChange: (value: unknown) => void;
  assetToken?: string;
}) {
  const [ordered] = useState(() => {
    const stimuli = question.stimuli ?? [];
    const submittedOrder = value && typeof value === "object"
      ? (value as Record<string, unknown>).displayOrder
      : undefined;
    if (Array.isArray(submittedOrder)) {
      const byId = new Map(stimuli.map((stimulus) => [stimulus.id, stimulus]));
      const restored = submittedOrder.map((id) => byId.get(String(id)));
      if (restored.length === stimuli.length && restored.every(Boolean)
          && new Set(submittedOrder.map(String)).size === stimuli.length) {
        return restored as typeof stimuli;
      }
    }
    const items = [...stimuli];
    if (!question.randomizeStimuli) return items;
    for (let i = items.length - 1; i > 0; i--) {
      const random = globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
      const j = random % (i + 1);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  });
  const selectedId = value && typeof value === "object"
    ? String((value as Record<string, unknown>).selectedId ?? "")
    : "";
  const displayOrder = ordered.map((stimulus) => stimulus.id);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Vælg foretrukket billede">
      {ordered.map((stimulus) => {
        const selected = selectedId === stimulus.id;
        return (
          <button
            key={stimulus.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange({
              selectedId: stimulus.id,
              selectedAssetId: stimulus.assetId,
              displayOrder,
            })}
            className={cn(
              "relative min-w-0 overflow-hidden rounded-lg border-2 bg-surface p-2 text-left transition-colors cursor-pointer",
              selected ? "border-accent ring-2 ring-accent/25" : "border-line hover:border-accent/50",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={stimulusUrl(stimulus, assetToken)}
              alt={stimulus.altText}
              className="h-48 w-full max-w-full object-contain"
            />
            <span className={cn("mt-2 block text-sm", selected ? "font-semibold text-accent" : "text-muted")}>
              {selected ? "Valgt" : "Vælg dette billede"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
