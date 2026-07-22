"use client";

import { useMemo, useState, useTransition } from "react";
import {
  QUESTION_TYPES,
  validateInstrument,
  type InstrumentDefinition,
  type Locale,
  type Question,
} from "@ok/domain";
import { Badge, Button, Input, Label, Select, Textarea, cn } from "@/components/ui";
import { SurveyRenderer } from "@/components/survey/renderer";
import { QUESTION_TYPE, label as dkLabel } from "@/lib/labels";
import { updateDraft } from "../../actions";

/** Kladdeeditor til instrumentet: spørgsmålsliste, editor pr. spørgsmål, logik, forhåndsvisning. */

const CONDITION_OPS = ["eq", "ne", "lt", "lte", "gt", "gte", "answered"] as const;

const OP_LABEL: Record<string, string> = {
  eq: "er lig med",
  ne: "er forskellig fra",
  lt: "er mindre end",
  lte: "er højst",
  gt: "er større end",
  gte: "er mindst",
  answered: "er besvaret",
};

let uid = 0;
const nextId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(uid++).toString(36)}`;

export function Builder({
  studyId,
  initialDefinition,
}: {
  studyId: string;
  initialDefinition: InstrumentDefinition;
}) {
  const [def, setDef] = useState<InstrumentDefinition>(initialDefinition);
  const [selected, setSelected] = useState<string | null>(def.blocks[0]?.questions[0]?.code ?? null);
  const [dirty, setDirty] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile" | null>(null);
  const [pending, startTransition] = useTransition();

  const questions = useMemo(() => def.blocks.flatMap((b) => b.questions), [def]);
  const problems = useMemo(() => validateInstrument(def), [def]);
  const current = questions.find((q) => q.code === selected) ?? null;

  function mutate(fn: (d: InstrumentDefinition) => void) {
    setDef((d) => {
      const copy = structuredClone(d);
      fn(copy);
      return copy;
    });
    setDirty(true);
    setSaveMsg(null);
  }

  function updateQuestion(code: string, patch: Partial<Question>) {
    mutate((d) => {
      for (const b of d.blocks) {
        const i = b.questions.findIndex((q) => q.code === code);
        if (i !== -1) b.questions[i] = { ...b.questions[i], ...patch };
      }
    });
  }

  function addQuestion(type: Question["type"]) {
    const base = type.replace(/[^a-z]/g, "_");
    let code = base;
    let n = 2;
    while (questions.some((q) => q.code === code)) code = `${base}_${n++}`;
    const q: Question = {
      code,
      type,
      label: { da: "", en: "" },
      required: false,
      ...(needsOptions(type)
        ? {
            options: [
              { id: "opt1", label: { da: "Mulighed 1", en: "Option 1" }, ...(type === "likert" ? { value: 1 } : {}) },
              { id: "opt2", label: { da: "Mulighed 2", en: "Option 2" }, ...(type === "likert" ? { value: 2 } : {}) },
            ],
          }
        : {}),
      ...(type === "rating" ? { scale: { min: 1, max: 5 } } : {}),
      ...(type === "matrix"
        ? {
            rows: [{ id: "row1", label: { da: "Række 1", en: "Row 1" } }],
            options: [
              { id: "1", label: { da: "1", en: "1" }, value: 1 },
              { id: "2", label: { da: "2", en: "2" }, value: 2 },
              { id: "3", label: { da: "3", en: "3" }, value: 3 },
            ],
          }
        : {}),
    };
    mutate((d) => {
      if (d.blocks.length === 0) d.blocks.push({ id: nextId("b"), questions: [] });
      d.blocks[d.blocks.length - 1].questions.push(q);
    });
    setSelected(code);
  }

  function move(code: string, dir: -1 | 1) {
    mutate((d) => {
      const flat = d.blocks.flatMap((b) => b.questions);
      const i = flat.findIndex((q) => q.code === code);
      const j = i + dir;
      if (i === -1 || j < 0 || j >= flat.length) return;
      [flat[i], flat[j]] = [flat[j], flat[i]];
      d.blocks = [{ id: d.blocks[0]?.id ?? "b1", questions: flat }];
    });
  }

  function remove(code: string) {
    mutate((d) => {
      for (const b of d.blocks) b.questions = b.questions.filter((q) => q.code !== code);
    });
    if (selected === code) setSelected(null);
  }

  function save() {
    startTransition(async () => {
      const res = await updateDraft(studyId, def);
      setDirty(false);
      setSaveMsg(
        res.problems.length === 0
          ? "Kladden er gemt."
          : `Kladden er gemt med ${res.problems.length} valideringsadvarsel(-ler).`,
      );
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={pending || !dirty}>
          {dirty ? "Gem kladde" : "Gemt"}
        </Button>
        <Button variant="secondary" onClick={() => setPreviewMode(previewMode ? null : "desktop")}>
          {previewMode ? "Luk forhåndsvisning" : "Forhåndsvisning"}
        </Button>
        {previewMode && (
          <Select aria-label="Forhåndsvisningsenhed" value={previewMode} onChange={(e) => setPreviewMode(e.target.value as "desktop" | "mobile")}>
            <option value="desktop">Desktop</option>
            <option value="mobile">Mobil (375 px)</option>
          </Select>
        )}
        <label className="ml-2 flex items-center gap-1 text-sm">
          Standardsprog
          <Select
            aria-label="Standardsprog"
            value={def.defaultLanguage}
            onChange={(e) => mutate((d) => { d.defaultLanguage = e.target.value as Locale; })}
          >
            <option value="da">dansk</option>
            <option value="en">engelsk</option>
          </Select>
        </label>
        {saveMsg && <span className="text-sm text-success">{saveMsg}</span>}
        {problems.length > 0 && <Badge tone="amber">{problems.length} valideringsproblem(er)</Badge>}
      </div>

      {problems.length > 0 && (
        <details className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">Valideringsproblemer (blokerer publicering)</summary>
          <ul className="mt-1 list-disc pl-5">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </details>
      )}

      {previewMode ? (
        <div className="rounded-xl border border-line bg-background p-4">
          <div className={cn("mx-auto", previewMode === "mobile" ? "max-w-[375px]" : "max-w-2xl")}>
            <SurveyRenderer key={JSON.stringify(def).length} definition={def} mode="preview" />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="rounded-xl border border-line bg-surface shadow-card">
            <div className="border-b border-line px-3 py-2 text-sm font-semibold text-heading">Spørgsmål</div>
            <ul>
              {questions.map((q, i) => (
                <li key={q.code}
                  className={cn(
                    "flex items-center gap-1 border-b border-line/60 px-2 py-1.5 text-sm",
                    selected === q.code && "bg-accent-soft",
                  )}>
                  <button className="flex-1 truncate text-left cursor-pointer" onClick={() => setSelected(q.code)}>
                    <span className="mr-1.5 text-xs text-muted">{i + 1}.</span>
                    <Badge className="mr-1.5">{dkLabel(QUESTION_TYPE, q.type)}</Badge>
                    {q.label[def.defaultLanguage] || q.code}
                  </button>
                  <button aria-label={`Flyt ${q.code} op`} className="px-1 text-muted hover:text-foreground cursor-pointer" onClick={() => move(q.code, -1)}>↑</button>
                  <button aria-label={`Flyt ${q.code} ned`} className="px-1 text-muted hover:text-foreground cursor-pointer" onClick={() => move(q.code, 1)}>↓</button>
                  <button aria-label={`Slet ${q.code}`} className="px-1 text-muted hover:text-danger cursor-pointer" onClick={() => remove(q.code)}>×</button>
                </li>
              ))}
              {questions.length === 0 && <li className="px-3 py-3 text-sm text-muted">Ingen spørgsmål endnu.</li>}
            </ul>
            <div className="flex gap-2 p-2">
              <Select aria-label="Ny spørgsmålstype" id="new-q-type" defaultValue="nps">
                {QUESTION_TYPES.map((t) => <option key={t} value={t}>{dkLabel(QUESTION_TYPE, t)}</option>)}
              </Select>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const sel = document.getElementById("new-q-type") as HTMLSelectElement;
                  addQuestion(sel.value as Question["type"]);
                }}
              >
                + Tilføj
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
            {current ? (
              <QuestionEditor
                key={current.code}
                question={current}
                allQuestions={questions}
                onChange={(patch) => updateQuestion(current.code, patch)}
              />
            ) : (
              <MessagesEditor def={def} mutate={mutate} />
            )}
            {current && (
              <button className="mt-4 text-xs text-accent underline cursor-pointer" onClick={() => setSelected(null)}>
                Redigér intro- og afslutningstekster i stedet
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function needsOptions(t: string) {
  return ["single_choice", "multiple_choice", "dropdown", "likert", "ranking"].includes(t);
}

function LocalizedInput({
  label, value, onChange, textarea,
}: {
  label: string;
  value: { da?: string; en?: string };
  onChange: (v: { da?: string; en?: string }) => void;
  textarea?: boolean;
}) {
  const C = textarea ? Textarea : Input;
  // felterne ligger inde i deres label-elementer (implicit tilknytning)
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">{label} (dansk)</span>
        <C value={value.da ?? ""} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...value, da: e.target.value })} rows={2} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">{label} (engelsk variant)</span>
        <C value={value.en ?? ""} onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...value, en: e.target.value })} rows={2} />
      </label>
    </div>
  );
}

function QuestionEditor({
  question, allQuestions, onChange,
}: {
  question: Question;
  allQuestions: Question[];
  onChange: (patch: Partial<Question>) => void;
}) {
  const priorQuestions = allQuestions.slice(0, allQuestions.findIndex((q) => q.code === question.code));
  const laterQuestions = allQuestions.slice(allQuestions.findIndex((q) => q.code === question.code) + 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Badge tone="accent">{dkLabel(QUESTION_TYPE, question.type)}</Badge>
        <code className="text-xs text-muted">{question.code}</code>
        <label className="ml-auto flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={question.required}
            onChange={(e) => onChange({ required: e.target.checked })} />
          Obligatorisk
        </label>
      </div>

      <LocalizedInput label="Spørgsmål" value={question.label} onChange={(label) => onChange({ label })} />
      <LocalizedInput label="Hjælpetekst" value={question.helpText ?? {}} onChange={(helpText) => onChange({ helpText })} />

      {needsOptions(question.type) && (
        <div>
          <Label>Svarmuligheder {question.type === "likert" ? "(med talværdier)" : ""}</Label>
          <ul className="space-y-1.5">
            {(question.options ?? []).map((opt, i) => (
              <li key={opt.id} className="flex flex-wrap items-center gap-1.5">
                <Input aria-label={`Mulighed ${i + 1} (dansk)`} className="w-44" placeholder="dansk"
                  value={opt.label.da ?? ""}
                  onChange={(e) => {
                    const options = structuredClone(question.options ?? []);
                    options[i].label.da = e.target.value;
                    onChange({ options });
                  }} />
                <Input aria-label={`Mulighed ${i + 1} (engelsk)`} className="w-44" placeholder="engelsk"
                  value={opt.label.en ?? ""}
                  onChange={(e) => {
                    const options = structuredClone(question.options ?? []);
                    options[i].label.en = e.target.value;
                    onChange({ options });
                  }} />
                {question.type === "likert" && (
                  <Input aria-label={`Mulighed ${i + 1} værdi`} type="number" className="w-20"
                    value={opt.value === undefined ? "" : String(opt.value)}
                    onChange={(e) => {
                      const options = structuredClone(question.options ?? []);
                      options[i].value = e.target.value === "" ? undefined : Number(e.target.value);
                      onChange({ options });
                    }} />
                )}
                <button aria-label={`Fjern mulighed ${i + 1}`} className="px-1 text-muted hover:text-danger cursor-pointer"
                  onClick={() => onChange({ options: (question.options ?? []).filter((_, j) => j !== i) })}>
                  ×
                </button>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="secondary" className="mt-2"
            onClick={() => onChange({
              options: [...(question.options ?? []), { id: nextId("opt"), label: { da: "", en: "" } }],
            })}>
            + Mulighed
          </Button>
          <label className="ml-3 inline-flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={question.randomizeOptions ?? false}
              onChange={(e) => onChange({ randomizeOptions: e.target.checked })} />
            Bland rækkefølgen af muligheder
          </label>
        </div>
      )}

      {question.type === "rating" && (
        <div className="flex gap-3">
          <div>
            <Label>Min.</Label>
            <Input type="number" className="w-20" value={question.scale?.min ?? 1}
              onChange={(e) => onChange({ scale: { ...(question.scale ?? { min: 1, max: 5 }), min: Number(e.target.value) } })} />
          </div>
          <div>
            <Label>Maks.</Label>
            <Input type="number" className="w-20" value={question.scale?.max ?? 5}
              onChange={(e) => onChange({ scale: { ...(question.scale ?? { min: 1, max: 5 }), max: Number(e.target.value) } })} />
          </div>
        </div>
      )}

      {question.type === "matrix" && (
        <div>
          <Label>Rækker</Label>
          <ul className="space-y-1.5">
            {(question.rows ?? []).map((row, i) => (
              <li key={row.id} className="flex items-center gap-1.5">
                <Input aria-label={`Række ${i + 1} (dansk)`} className="w-44" placeholder="dansk" value={row.label.da ?? ""}
                  onChange={(e) => {
                    const rows = structuredClone(question.rows ?? []);
                    rows[i].label.da = e.target.value;
                    onChange({ rows });
                  }} />
                <Input aria-label={`Række ${i + 1} (engelsk)`} className="w-44" placeholder="engelsk" value={row.label.en ?? ""}
                  onChange={(e) => {
                    const rows = structuredClone(question.rows ?? []);
                    rows[i].label.en = e.target.value;
                    onChange({ rows });
                  }} />
                <button aria-label={`Fjern række ${i + 1}`} className="px-1 text-muted hover:text-danger cursor-pointer"
                  onClick={() => onChange({ rows: (question.rows ?? []).filter((_, j) => j !== i) })}>×</button>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="secondary" className="mt-2"
            onClick={() => onChange({ rows: [...(question.rows ?? []), { id: nextId("row"), label: { da: "", en: "" } }] })}>
            + Række
          </Button>
        </div>
      )}

      {question.type === "first_click" && (
        <div className="space-y-3">
          <LocalizedInput label="Opgaveinstruktion" value={question.taskText ?? {}} onChange={(taskText) => onChange({ taskText })} />
          <div>
            <Label htmlFor="fc-img">Billed-URL til stimulus (eller data-URI)</Label>
            <Textarea id="fc-img" rows={2} value={question.imageUrl ?? ""}
              onChange={(e) => onChange({ imageUrl: e.target.value })} />
            {question.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={question.imageUrl} alt="Forhåndsvisning af stimulus" className="mt-2 max-h-48 rounded-lg border border-line" />
            )}
          </div>
        </div>
      )}

      <div className="border-t border-line pt-3">
        <Label>Vis kun hvis (alle betingelser skal gælde)</Label>
        <ConditionRows
          conditions={question.visibleIf ?? []}
          candidates={priorQuestions}
          onChange={(visibleIf) => onChange({ visibleIf })}
        />
      </div>

      <div className="border-t border-line pt-3">
        <Label>Efter svar: spring til (første regel, der matcher, vinder)</Label>
        <ul className="space-y-1.5">
          {(question.branches ?? []).map((br, i) => (
            <li key={br.id} className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-muted">hvis svaret</span>
              <Select aria-label="Betingelsesoperator" value={br.when[0]?.op ?? "eq"}
                onChange={(e) => {
                  const branches = structuredClone(question.branches ?? []);
                  branches[i].when = [{ questionCode: question.code, op: e.target.value as typeof CONDITION_OPS[number], value: br.when[0]?.value }];
                  onChange({ branches });
                }}>
                {CONDITION_OPS.map((op) => <option key={op} value={op}>{OP_LABEL[op] ?? op}</option>)}
              </Select>
              <Input aria-label="Betingelsesværdi" className="w-24"
                value={String(br.when[0]?.value ?? "")}
                onChange={(e) => {
                  const branches = structuredClone(question.branches ?? []);
                  const raw = e.target.value;
                  const num = Number(raw);
                  branches[i].when = [{
                    questionCode: question.code,
                    op: br.when[0]?.op ?? "eq",
                    value: raw !== "" && !Number.isNaN(num) ? num : raw,
                  }];
                  onChange({ branches });
                }} />
              <span className="text-muted">gå til</span>
              <Select aria-label="Mål for springet" value={br.goTo}
                onChange={(e) => {
                  const branches = structuredClone(question.branches ?? []);
                  branches[i].goTo = e.target.value;
                  onChange({ branches });
                }}>
                {laterQuestions.map((q) => <option key={q.code} value={q.code}>{q.code}</option>)}
                <option value="END">AFSLUT (takkeside)</option>
                <option value="DISQUALIFY">FRASORTÉR</option>
              </Select>
              <button aria-label="Fjern springregel" className="px-1 text-muted hover:text-danger cursor-pointer"
                onClick={() => onChange({ branches: (question.branches ?? []).filter((_, j) => j !== i) })}>×</button>
            </li>
          ))}
        </ul>
        <Button size="sm" variant="secondary" className="mt-2"
          onClick={() => onChange({
            branches: [
              ...(question.branches ?? []),
              { id: nextId("br"), when: [{ questionCode: question.code, op: "eq", value: "" }], goTo: "END" },
            ],
          })}>
          + Springregel
        </Button>
      </div>
    </div>
  );
}

function ConditionRows({
  conditions, candidates, onChange,
}: {
  conditions: NonNullable<Question["visibleIf"]>;
  candidates: Question[];
  onChange: (c: NonNullable<Question["visibleIf"]>) => void;
}) {
  return (
    <div>
      <ul className="space-y-1.5">
        {conditions.map((c, i) => (
          <li key={i} className="flex flex-wrap items-center gap-1.5 text-sm">
            <Select aria-label="Betingelsens spørgsmål" value={c.questionCode}
              onChange={(e) => {
                const next = structuredClone(conditions);
                next[i].questionCode = e.target.value;
                onChange(next);
              }}>
              {candidates.map((q) => <option key={q.code} value={q.code}>{q.code}</option>)}
            </Select>
            <Select aria-label="Betingelsesoperator" value={c.op}
              onChange={(e) => {
                const next = structuredClone(conditions);
                next[i].op = e.target.value as typeof c.op;
                onChange(next);
              }}>
              {CONDITION_OPS.map((op) => <option key={op} value={op}>{OP_LABEL[op] ?? op}</option>)}
            </Select>
            <Input aria-label="Betingelsesværdi" className="w-24" value={String(c.value ?? "")}
              onChange={(e) => {
                const next = structuredClone(conditions);
                const raw = e.target.value;
                const num = Number(raw);
                next[i].value = raw !== "" && !Number.isNaN(num) ? num : raw;
                onChange(next);
              }} />
            <button aria-label="Fjern betingelse" className="px-1 text-muted hover:text-danger cursor-pointer"
              onClick={() => onChange(conditions.filter((_, j) => j !== i))}>×</button>
          </li>
        ))}
      </ul>
      {candidates.length === 0 ? (
        <p className="mt-1 text-xs text-muted">Der kan kun henvises til tidligere spørgsmål.</p>
      ) : (
        <Button size="sm" variant="secondary" className="mt-2"
          onClick={() => onChange([...conditions, { questionCode: candidates[0].code, op: "eq", value: "" }])}>
          + Betingelse
        </Button>
      )}
    </div>
  );
}

function MessagesEditor({
  def, mutate,
}: {
  def: InstrumentDefinition;
  mutate: (fn: (d: InstrumentDefinition) => void) => void;
}) {
  const entries: { key: "intro" | "thankYou" | "disqualified" | "closed"; label: string }[] = [
    { key: "intro", label: "Introtekst" },
    { key: "thankYou", label: "Takketekst" },
    { key: "disqualified", label: "Frasorteret-tekst" },
    { key: "closed", label: "Lukket-tekst" },
  ];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Vælg et spørgsmål til venstre, eller redigér undersøgelsens tekster nedenfor.</p>
      {entries.map(({ key, label }) => (
        <LocalizedInput
          key={key}
          label={label}
          textarea
          value={def.messages?.[key] ?? {}}
          onChange={(v) => mutate((d) => { d.messages = { ...(d.messages ?? {}), [key]: v }; })}
        />
      ))}
    </div>
  );
}
