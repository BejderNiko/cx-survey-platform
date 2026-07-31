"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import {
  QUESTION_TYPES,
  validateInstrument,
  type InstrumentDefinition,
  type Locale,
  type Question,
} from "@ok/domain";
import { Badge, Button, Input, Label, Select, Textarea, cn } from "@/components/ui";
import { SurveyRenderer } from "@/components/survey/renderer";
import { updateDraft } from "../../actions";

const CONDITION_OPS = ["eq", "ne", "lt", "lte", "gt", "gte", "answered"] as const;
const OPTION_TYPES = ["single_choice", "multiple_choice", "dropdown", "likert", "ranking"];

let uid = 0;
const nextId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(uid++).toString(36)}`;
const needsOptions = (type: string) => OPTION_TYPES.includes(type);
const anchorFor = (id: string) => `section-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

const QUESTION_META: Record<Question["type"], { label: string; hint: string; tone: string }> = {
  nps: { label: "NPS", hint: "Ask for recommendation likelihood on a 0-10 scale.", tone: "bg-orange-100 text-orange-700" },
  csat: { label: "CSAT", hint: "Measure satisfaction on a five-point scale.", tone: "bg-orange-100 text-orange-700" },
  ces: { label: "Effort scale", hint: "Measure effort on a seven-point scale.", tone: "bg-orange-100 text-orange-700" },
  single_choice: { label: "Single select", hint: "Ask participants to choose one option from the list.", tone: "bg-orange-100 text-orange-700" },
  multiple_choice: { label: "Multiple select", hint: "Let participants choose several options.", tone: "bg-orange-100 text-orange-700" },
  dropdown: { label: "Dropdown", hint: "Show choices in a compact dropdown.", tone: "bg-orange-100 text-orange-700" },
  short_text: { label: "Short text", hint: "Ask participants to provide a brief response in a single line.", tone: "bg-slate-100 text-slate-700" },
  long_text: { label: "Long text", hint: "Ask participants to provide a detailed, long-form written response.", tone: "bg-slate-100 text-slate-700" },
  number: { label: "Number", hint: "Collect a numeric answer.", tone: "bg-slate-100 text-slate-700" },
  date: { label: "Date", hint: "Collect a calendar date.", tone: "bg-slate-100 text-slate-700" },
  rating: { label: "Linear scale", hint: "Ask participants to choose a value on a numeric scale.", tone: "bg-orange-100 text-orange-700" },
  likert: { label: "Likert scale", hint: "Measure agreement using labelled values.", tone: "bg-orange-100 text-orange-700" },
  matrix: { label: "Matrix", hint: "Rate several rows with the same answer scale.", tone: "bg-violet-100 text-violet-700" },
  ranking: { label: "Ranking", hint: "Ask participants to order options by preference.", tone: "bg-violet-100 text-violet-700" },
  consent: { label: "Agreement", hint: "Ask participants to accept or decline a statement.", tone: "bg-slate-100 text-slate-700" },
  first_click: { label: "Design survey", hint: "Show a design and record the participant's first click.", tone: "bg-amber-100 text-amber-700" },
  preference_test: { label: "Preference test", hint: "Ask participants to choose their preferred design.", tone: "bg-violet-100 text-violet-700" },
};

function makeQuestion(type: Question["type"], existing: Question[]): Question {
  const base = type.replace(/[^a-z]/g, "_");
  let code = base;
  let count = 2;
  while (existing.some((question) => question.code === code)) code = `${base}_${count++}`;
  return {
    code,
    type,
    label: { da: "", en: "" },
    required: false,
    ...(needsOptions(type) ? {
      options: [
        { id: nextId("opt"), label: { da: "Mulighed 1", en: "Option 1" }, ...(type === "likert" ? { value: 1 } : {}) },
        { id: nextId("opt"), label: { da: "Mulighed 2", en: "Option 2" }, ...(type === "likert" ? { value: 2 } : {}) },
      ],
    } : {}),
    ...(type === "rating" ? { scale: { min: 0, max: 10, minLabel: { da: "Meget negativ", en: "Very negative" }, maxLabel: { da: "Meget positiv", en: "Very positive" } } } : {}),
    ...(type === "matrix" ? {
      rows: [{ id: nextId("row"), label: { da: "R\u00e6kke 1", en: "Row 1" } }],
      options: [
        { id: nextId("col"), label: { da: "1", en: "1" }, value: 1 },
        { id: nextId("col"), label: { da: "2", en: "2" }, value: 2 },
      ],
    } : {}),
  };
}

export function Builder({
  studyId,
  initialTitle,
  initialDefinition,
}: {
  studyId: string;
  initialTitle: string;
  initialDefinition: InstrumentDefinition;
}) {
  const [definition, setDefinition] = useState(initialDefinition);
  const [studyTitle, setStudyTitle] = useState(initialTitle);
  const [editingLocale, setEditingLocale] = useState<Locale>(initialDefinition.defaultLanguage);
  const [dirty, setDirty] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile" | null>(null);
  const [pending, startTransition] = useTransition();

  const questions = useMemo(() => definition.blocks.flatMap((block) => block.questions), [definition]);
  const problems = useMemo(() => validateInstrument(definition), [definition]);

  function mutate(change: (draft: InstrumentDefinition) => void) {
    setDefinition((current) => {
      const copy = structuredClone(current);
      change(copy);
      return copy;
    });
    setDirty(true);
    setSaveMessage(null);
  }

  function updateQuestion(code: string, patch: Partial<Question>) {
    mutate((draft) => {
      for (const block of draft.blocks) {
        const index = block.questions.findIndex((question) => question.code === code);
        if (index >= 0) block.questions[index] = { ...block.questions[index], ...patch };
      }
    });
  }

  function addQuestion(blockId: string, type: Question["type"]) {
    const question = makeQuestion(type, questions);
    mutate((draft) => {
      const block = draft.blocks.find((item) => item.id === blockId);
      block?.questions.push(question);
    });
    requestAnimationFrame(() => document.getElementById(`question-${question.code}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  function addBlock() {
    const id = nextId("block");
    mutate((draft) => draft.blocks.push({
      id,
      title: { da: `Sektion ${draft.blocks.length + 1}`, en: `Section ${draft.blocks.length + 1}` },
      questions: [],
    }));
    requestAnimationFrame(() => document.getElementById(anchorFor(id))?.scrollIntoView({ behavior: "smooth" }));
  }

  function moveQuestion(blockId: string, index: number, direction: -1 | 1) {
    mutate((draft) => {
      const block = draft.blocks.find((item) => item.id === blockId);
      if (!block) return;
      const target = index + direction;
      if (target < 0 || target >= block.questions.length) return;
      [block.questions[index], block.questions[target]] = [block.questions[target], block.questions[index]];
    });
  }

  function removeQuestion(code: string) {
    mutate((draft) => {
      for (const block of draft.blocks) block.questions = block.questions.filter((question) => question.code !== code);
    });
  }

  function removeBlock(blockId: string) {
    const block = definition.blocks.find((item) => item.id === blockId);
    if (!block || definition.blocks.length === 1) return;
    const message = block.questions.length
      ? `Delete this section and its ${block.questions.length} question(s)?`
      : "Delete this empty section?";
    if (!window.confirm(message)) return;
    mutate((draft) => { draft.blocks = draft.blocks.filter((item) => item.id !== blockId); });
  }

  function save() {
    startTransition(async () => {
      try {
        const result = await updateDraft(studyId, definition, studyTitle);
        setDirty(false);
        setSaveMessage(result.problems.length === 0 ? "All changes saved" : `Saved with ${result.problems.length} validation warning(s)`);
      } catch (error) {
        setSaveMessage(error instanceof Error ? error.message : "Changes could not be saved");
      }
    });
  }

  return (
    <div className="-m-4 min-h-[calc(100vh-3.5rem)] bg-[#f4f6f7] md:-m-6">
      <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center gap-3 border-b border-[#dfe3e6] bg-white/95 px-4 py-3 shadow-[0_1px_0_rgba(15,23,42,0.03)] backdrop-blur md:px-6">
        <Link href={`/studies/${studyId}`} className="inline-flex h-9 items-center gap-2 rounded-lg px-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-950">
          <Icon name="arrow-left" />
          Study
        </Link>
        <span className="hidden h-6 w-px bg-slate-200 sm:block" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-950">{studyTitle || "Untitled study"}</p>
          <p className="text-xs text-slate-500">{dirty ? "Unsaved changes" : saveMessage ?? "Draft saved"}</p>
        </div>
        {problems.length > 0 && <Badge tone="amber">{problems.length} warning{problems.length === 1 ? "" : "s"}</Badge>}
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <span className="hidden sm:inline">Participant device</span>
          <Select
            aria-label="Deltagerenhed"
            value={definition.participantDevice}
            onChange={(event) => mutate((draft) => { draft.participantDevice = event.target.value as InstrumentDefinition["participantDevice"]; })}
            className="h-9 min-w-28 border-slate-200 bg-white text-xs"
          >
            <option value="any">Any device</option>
            <option value="desktop">Desktop</option>
            <option value="mobile">Mobile</option>
          </Select>
        </label>
        <Button variant="secondary" onClick={() => setPreviewMode(previewMode ? null : "desktop")}>
          <Icon name="eye" /> {previewMode ? "Close preview" : "Preview"}
        </Button>
        <Link
          href={`/studies/${studyId}/builder?mode=legacy`}
          className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-950"
          onClick={(event) => {
            if (dirty && !window.confirm("Open the legacy editor and discard unsaved changes?")) event.preventDefault();
          }}
          title="Open legacy builder fallback"
        >
          Legacy editor
        </Link>
        <Button onClick={save} disabled={pending || !dirty || !studyTitle.trim()}>
          <Icon name="save" /> {pending ? "Saving..." : dirty ? "Save changes" : "Saved"}
        </Button>
      </header>

      {previewMode ? (
        <PreviewPanel
          definition={definition}
          title={studyTitle}
          mode={previewMode}
          onModeChange={setPreviewMode}
        />
      ) : (
        <div className="flex min-h-[calc(100vh-4rem)] items-stretch">
          <BuilderSidebar definition={definition} locale={editingLocale} />
          <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-10">
            <div className="mx-auto max-w-[1080px] space-y-9">
              {problems.length > 0 && <ValidationNotice problems={problems} />}
              <StudyDetails
                title={studyTitle}
                definition={definition}
                editingLocale={editingLocale}
                onTitleChange={(value) => { setStudyTitle(value); setDirty(true); setSaveMessage(null); }}
                onLocaleChange={setEditingLocale}
                mutate={mutate}
              />
              <MessageSection
                id="welcome-screen"
                title="Welcome screen"
                icon="spark"
                locale={editingLocale}
                value={definition.messages?.intro ?? {}}
                onChange={(intro) => mutate((draft) => { draft.messages = { ...draft.messages, intro }; })}
                kind="welcome"
              />
              <AddSectionButton onClick={addBlock} />
              {definition.blocks.map((block, blockIndex) => (
                <StudySection
                  key={block.id}
                  block={block}
                  blockIndex={blockIndex}
                  locale={editingLocale}
                  allQuestions={questions}
                  onTitleChange={(title) => mutate((draft) => {
                    const current = draft.blocks.find((item) => item.id === block.id);
                    if (current) current.title = title;
                  })}
                  onQuestionChange={updateQuestion}
                  onAddQuestion={(type) => addQuestion(block.id, type)}
                  onMoveQuestion={(index, direction) => moveQuestion(block.id, index, direction)}
                  onRemoveQuestion={removeQuestion}
                  onRemoveSection={() => removeBlock(block.id)}
                  canRemoveSection={definition.blocks.length > 1}
                />
              ))}
              <AddSectionButton onClick={addBlock} />
              <MessageSection
                id="thank-you-screen"
                title="Thank you screen"
                icon="thumb"
                locale={editingLocale}
                value={definition.messages?.thankYou ?? {}}
                onChange={(thankYou) => mutate((draft) => { draft.messages = { ...draft.messages, thankYou }; })}
                kind="thanks"
              />
              <OutcomeMessages
                locale={editingLocale}
                definition={definition}
                mutate={mutate}
              />
              <div className="h-10" />
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

function BuilderSidebar({ definition, locale }: { definition: InstrumentDefinition; locale: Locale }) {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-[#d9dee2] bg-[#f8fafb] lg:block">
      <div className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto px-3 py-5">
        <p className="px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Setup</p>
        <a href="#study-details" className="mt-2 flex items-center gap-2 rounded-lg bg-slate-200/70 px-3 py-2.5 text-sm font-semibold text-slate-900">
          <Icon name="details" /> Test details
        </a>
        <div className="my-5 h-px bg-slate-200" />
        <p className="px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Sections</p>
        <nav aria-label="Study sections" className="mt-2 space-y-1">
          <SidebarLink href="#welcome-screen" label="Welcome screen" tone="slate" icon="spark" />
          {definition.blocks.map((block, index) => {
            const hasDesign = block.questions.some((question) => question.type === "first_click");
            const hiddenCount = block.questions.filter((question) => question.hidden).length;
            const title = block.title?.[locale] || block.title?.[locale === "da" ? "en" : "da"] || (hasDesign ? "Design survey" : "Survey questions");
            return (
              <SidebarLink
                key={block.id}
                href={`#${anchorFor(block.id)}`}
                label={`${index + 1}. ${title}`}
                tone={hasDesign ? "amber" : "orange"}
                icon={hasDesign ? "image" : "question"}
                hiddenCount={hiddenCount}
                drag
              />
            );
          })}
          <SidebarLink href="#thank-you-screen" label="Thank you screen" tone="slate" icon="thumb" />
        </nav>
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500">
          <div className="flex items-center justify-between">
            <span>{definition.blocks.length} sections</span>
            <span>{definition.blocks.reduce((sum, block) => sum + block.questions.length, 0)} questions</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

function SidebarLink({
  href, label, tone, icon, hiddenCount = 0, drag = false,
}: {
  href: string;
  label: string;
  tone: "slate" | "orange" | "amber";
  icon: IconName;
  hiddenCount?: number;
  drag?: boolean;
}) {
  const tones = {
    slate: "bg-slate-200 text-slate-600",
    orange: "bg-orange-100 text-orange-700",
    amber: "bg-amber-100 text-amber-700",
  };
  return (
    <a href={href} className="group flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-[13px] text-slate-700 hover:bg-slate-200/60 hover:text-slate-950">
      <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded", tones[tone])}><Icon name={icon} size={12} /></span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hiddenCount > 0 && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">{hiddenCount} skjult</span>}
      {drag && <Icon name="grip" size={13} className="text-slate-400 opacity-0 group-hover:opacity-100" />}
    </a>
  );
}

function PreviewPanel({
  definition, title, mode, onModeChange,
}: {
  definition: InstrumentDefinition;
  title: string;
  mode: "desktop" | "mobile";
  onModeChange: (mode: "desktop" | "mobile") => void;
}) {
  return (
    <main className="px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Participant preview</h1>
            <p className="mt-1 text-sm text-slate-500">Responses are not stored in preview.</p>
          </div>
          <Select aria-label="Preview device" value={mode} onChange={(event) => onModeChange(event.target.value as "desktop" | "mobile")}>
            <option value="desktop">Desktop</option>
            <option value="mobile">Mobile (375 px)</option>
          </Select>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-10">
          <div className={cn("mx-auto transition-[max-width]", mode === "mobile" ? "max-w-[375px]" : "max-w-2xl")}>
            <SurveyRenderer key={JSON.stringify(definition)} definition={definition} mode="preview" studyTitle={title} />
          </div>
        </div>
      </div>
    </main>
  );
}

function ValidationNotice({ problems }: { problems: string[] }) {
  return (
    <details className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <summary className="cursor-pointer font-semibold">{problems.length} validation warning{problems.length === 1 ? "" : "s"}</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
    </details>
  );
}

function StudyDetails({
  title, definition, editingLocale, onTitleChange, onLocaleChange, mutate,
}: {
  title: string;
  definition: InstrumentDefinition;
  editingLocale: Locale;
  onTitleChange: (value: string) => void;
  onLocaleChange: (locale: Locale) => void;
  mutate: (change: (draft: InstrumentDefinition) => void) => void;
}) {
  return (
    <section id="study-details" className="scroll-mt-24">
      <h1 className="mb-4 font-serif text-2xl font-semibold tracking-tight text-slate-950">Study details</h1>
      <div className="rounded-2xl border border-[#dfe3e6] bg-white p-5 shadow-[0_2px_3px_rgba(15,23,42,0.05)] sm:p-6">
        <div className="space-y-5">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-700">Study name <Icon name="info" size={12} className="text-slate-400" /></span>
            <Input value={title} onChange={(event) => onTitleChange(event.target.value)} placeholder="Name your study" className="h-10" />
          </label>
          <div className="grid gap-5 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-700">Default language <Icon name="info" size={12} className="text-slate-400" /></span>
              <Select
                className="h-10 w-full"
                value={definition.defaultLanguage}
                onChange={(event) => {
                  const locale = event.target.value as Locale;
                  mutate((draft) => { draft.defaultLanguage = locale; });
                  onLocaleChange(locale);
                }}
              >
                <option value="da">Danish - dansk</option>
                <option value="en">English</option>
              </Select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Content language</span>
              <Select className="h-10 w-full" value={editingLocale} onChange={(event) => onLocaleChange(event.target.value as Locale)}>
                {definition.languages.map((locale) => <option key={locale} value={locale}>{locale === "da" ? "Danish content" : "English content"}</option>)}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Participant device</span>
              <Select
                className="h-10 w-full"
                value={definition.participantDevice}
                aria-label="Participant device"
                onChange={(event) => mutate((draft) => {
                  draft.participantDevice = event.target.value as InstrumentDefinition["participantDevice"];
                })}
              >
                <option value="any">Any device</option>
                <option value="desktop">Desktop</option>
                <option value="mobile">Mobile</option>
              </Select>
            </label>
          </div>
        </div>
      </div>
    </section>
  );
}

function MessageSection({
  id, title, icon, locale, value, onChange, kind,
}: {
  id: string;
  title: string;
  icon: IconName;
  locale: Locale;
  value: { da?: string; en?: string };
  onChange: (value: { da?: string; en?: string }) => void;
  kind: "welcome" | "thanks";
}) {
  const heading = kind === "welcome"
    ? (locale === "da" ? "Velkommen" : "Welcome")
    : (locale === "da" ? "Tak!" : "Thank you!");
  return (
    <section id={id} className="scroll-mt-24">
      <SectionHeading icon={icon}>{title}</SectionHeading>
      <div className="rounded-2xl border border-[#dfe3e6] bg-white p-5 shadow-[0_2px_3px_rgba(15,23,42,0.05)] sm:p-6">
        <div className="mb-5 flex items-center gap-2">
          <Icon name="details" className="text-slate-500" />
          <h3 className="text-lg font-semibold">Message</h3>
          <span className="ml-auto text-xs text-slate-500">Customize</span>
          <Toggle checked aria-label="Customize message" readOnly />
        </div>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">Heading</span>
            <Input value={heading} readOnly className="h-10 bg-slate-50 text-slate-600" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">Message</span>
            <Textarea rows={3} value={value[locale] ?? ""} onChange={(event) => onChange({ ...value, [locale]: event.target.value })} placeholder={kind === "welcome" ? "Welcome participants to your study" : "Thank participants for their feedback"} />
          </label>
          {kind === "welcome" && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Start button label</span>
              <Input value={locale === "da" ? "Start unders\u00f8gelsen" : "Start study"} readOnly className="h-10 bg-slate-50 text-slate-600" />
            </label>
          )}
        </div>
      </div>
    </section>
  );
}

function AddSectionButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex items-center gap-3" aria-label="Section separator">
      <span className="h-px flex-1 border-t border-dashed border-slate-300" />
      <Button size="sm" variant="secondary" onClick={onClick} className="bg-[#f4f6f7] text-slate-700 shadow-none">
        <Icon name="plus-circle" /> Add section
      </Button>
      <span className="h-px flex-1 border-t border-dashed border-slate-300" />
    </div>
  );
}

function SectionHeading({ icon, children, actions }: { icon: IconName; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex min-w-0 items-center gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-200 text-slate-600"><Icon name={icon} size={15} /></span>
      <h2 className="min-w-0 flex-1 font-serif text-2xl font-semibold tracking-tight text-slate-950">{children}</h2>
      {actions}
    </div>
  );
}

function StudySection({
  block,
  blockIndex,
  locale,
  allQuestions,
  onTitleChange,
  onQuestionChange,
  onAddQuestion,
  onMoveQuestion,
  onRemoveQuestion,
  onRemoveSection,
  canRemoveSection,
}: {
  block: InstrumentDefinition["blocks"][number];
  blockIndex: number;
  locale: Locale;
  allQuestions: Question[];
  onTitleChange: (title: { da?: string; en?: string }) => void;
  onQuestionChange: (code: string, patch: Partial<Question>) => void;
  onAddQuestion: (type: Question["type"]) => void;
  onMoveQuestion: (index: number, direction: -1 | 1) => void;
  onRemoveQuestion: (code: string) => void;
  onRemoveSection: () => void;
  canRemoveSection: boolean;
}) {
  const [newType, setNewType] = useState<Question["type"]>("single_choice");
  const hasDesign = block.questions.some((question) => question.type === "first_click");
  const title = block.title?.[locale] ?? "";
  const fallbackTitle = hasDesign ? "Design survey" : "Survey questions";
  return (
    <section id={anchorFor(block.id)} className="scroll-mt-24">

      <SectionHeading
        icon={hasDesign ? "image" : "question"}
        actions={
          <details className="relative">
            <summary className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-lg text-slate-500 hover:bg-slate-200" aria-label="Section menu"><Icon name="more" /></summary>
            <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
              <button type="button" disabled={!canRemoveSection} onClick={onRemoveSection} className="w-full rounded-md px-3 py-2 text-left text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40">Delete section</button>
            </div>
          </details>
        }
      >
        <span className="mr-2">{blockIndex + 1}.</span>
        <input
          aria-label={`Section ${blockIndex + 1} title`}
          value={title}
          placeholder={fallbackTitle}
          onChange={(event) => onTitleChange({ ...(block.title ?? {}), [locale]: event.target.value })}
          className="min-w-0 max-w-[70%] border-0 bg-transparent font:inherit outline-none placeholder:text-slate-950"
        />
      </SectionHeading>
      <div className="rounded-2xl border border-[#d9dee2] bg-white p-4 shadow-[0_2px_3px_rgba(15,23,42,0.05)] sm:p-5">
        <div className="space-y-3">
          {block.questions.map((question, questionIndex) => (
            <QuestionCard
              key={question.code}
              question={question}
              number={`${blockIndex + 1}.${questionIndex + 1}`}
              locale={locale}
              allQuestions={allQuestions}
              onChange={(patch) => onQuestionChange(question.code, patch)}
              onMoveUp={() => onMoveQuestion(questionIndex, -1)}
              onMoveDown={() => onMoveQuestion(questionIndex, 1)}
              onRemove={() => onRemoveQuestion(question.code)}
              canMoveUp={questionIndex > 0}
              canMoveDown={questionIndex < block.questions.length - 1}
            />
          ))}
          {block.questions.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center">
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-white text-slate-500 shadow-sm"><Icon name="question" /></span>
              <p className="mt-3 text-sm font-semibold">No questions in this section</p>
              <p className="mt-1 text-xs text-slate-500">Choose a question type below.</p>
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Select aria-label={`Question type for section ${blockIndex + 1}`} value={newType} onChange={(event) => setNewType(event.target.value as Question["type"])}>
            {QUESTION_TYPES.map((type) => <option key={type} value={type}>{QUESTION_META[type].label}</option>)}
          </Select>
          <Button size="sm" onClick={() => onAddQuestion(newType)}><Icon name="plus" /> Add another question</Button>
          <label className="ml-1 inline-flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" disabled /> Randomize question order
          </label>
        </div>
      </div>
    </section>
  );
}

function QuestionCard({
  question, number, locale, allQuestions, onChange, onMoveUp, onMoveDown, onRemove, canMoveUp, canMoveDown,
}: {
  question: Question;
  number: string;
  locale: Locale;
  allQuestions: Question[];
  onChange: (patch: Partial<Question>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const index = allQuestions.findIndex((item) => item.code === question.code);
  const priorQuestions = allQuestions.slice(0, index);
  const laterQuestions = allQuestions.slice(index + 1);
  const hasLogic = Boolean(question.visibleIf?.length || question.branches?.length);
  const [logicOpen, setLogicOpen] = useState(hasLogic);
  return (
    <article id={`question-${question.code}`} className={cn("scroll-mt-24 rounded-xl border p-4 transition-shadow focus-within:border-slate-400 focus-within:shadow-[0_4px_18px_rgba(15,23,42,0.08)]", question.hidden ? "border-dashed border-slate-300 bg-slate-50/80" : "border-[#d8dde1] bg-white")}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-label={`Drag question ${number}`} className="cursor-grab text-slate-400 hover:text-slate-700"><Icon name="grip" /></button>
        <span className="text-sm font-bold text-slate-900">{number}</span>
        <Select
          aria-label={`Question ${number} type`}
          value={question.type}
          onChange={(event) => {
            const type = event.target.value as Question["type"];
            const replacement = makeQuestion(type, allQuestions);
            onChange({
              ...replacement,
              code: question.code,
              label: question.label,
              helpText: question.helpText,
              required: question.required,
              hidden: question.hidden,
              visibleIf: question.visibleIf,
              branches: question.branches,
            });
          }}
          className="h-7 border-0 bg-slate-50 py-0 text-xs font-medium"
        >
          {QUESTION_TYPES.map((type) => <option key={type} value={type}>{QUESTION_META[type].label}</option>)}
        </Select>
        <QuestionHeaderToolbar
          number={number}
          required={question.required}
          hidden={Boolean(question.hidden)}
          hasLogic={hasLogic}
          logicRuleCount={(question.visibleIf?.length ?? 0) + (question.branches?.length ?? 0)}
          logicOpen={logicOpen}
          onRequiredChange={(required) => onChange({ required })}
          onLogicToggle={() => setLogicOpen((value) => !value)}
          onHiddenChange={(hidden) => onChange({ hidden })}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onRemove={onRemove}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
        />
      </div>
      <div className="mt-4">
        {question.type === "first_click" ? (
          <DesignQuestionBody question={question} locale={locale} onChange={onChange} />
        ) : (
          <QuestionBody question={question} locale={locale} onChange={onChange} />
        )}
      </div>
      <LogicEditor open={logicOpen} question={question} priorQuestions={priorQuestions} laterQuestions={laterQuestions} onChange={onChange} />
    </article>
  );
}

function QuestionHeaderToolbar({
  number, required, hidden, hasLogic, logicRuleCount, logicOpen,
  onRequiredChange, onLogicToggle, onHiddenChange, onMoveUp, onMoveDown, onRemove,
  canMoveUp, canMoveDown,
}: {
  number: string;
  required: boolean;
  hidden: boolean;
  hasLogic: boolean;
  logicRuleCount: number;
  logicOpen: boolean;
  onRequiredChange: (required: boolean) => void;
  onLogicToggle: () => void;
  onHiddenChange: (hidden: boolean) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  return (
    <div className="ml-auto flex min-h-9 flex-wrap items-center justify-end gap-2">
      <span className="text-xs leading-none text-slate-700">Required</span>
      <Toggle checked={required} onChange={onRequiredChange} aria-label={`Question ${number} required`} />
      <button
        type="button"
        onClick={onLogicToggle}
        aria-expanded={logicOpen}
        className={cn("inline-flex h-8 items-center gap-1 rounded-md px-2 text-[10px] font-bold uppercase tracking-wide", hasLogic ? "bg-cyan-100 text-cyan-800" : "bg-slate-100 text-slate-600")}
      >
        <Icon name="logic" size={12} /> Logic {hasLogic ? `on · ${logicRuleCount}` : "off"}
      </button>
      <button
        type="button"
        onClick={() => onHiddenChange(!hidden)}
        aria-pressed={hidden}
        aria-label={hidden ? `Show question ${number} to participants` : `Hide question ${number} from participants`}
        title={hidden ? "Hidden from participant preview and live surveys" : "Visible to participants"}
        className={cn("grid h-8 w-8 place-items-center rounded-md", hidden ? "bg-slate-700 text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100")}
      >
        <Icon name={hidden ? "eye-off" : "eye"} size={14} />
      </button>
      <details className="relative">
        <summary className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-md bg-slate-50 text-slate-600 hover:bg-slate-100" aria-label={`Question ${number} menu`}><Icon name="more" size={14} /></summary>
        <div className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-slate-200 bg-white p-1 text-xs shadow-lg">
          <button type="button" disabled={!canMoveUp} onClick={onMoveUp} className="w-full rounded-md px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-40">Move up</button>
          <button type="button" disabled={!canMoveDown} onClick={onMoveDown} className="w-full rounded-md px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-40">Move down</button>
          <button type="button" onClick={onRemove} className="w-full rounded-md px-3 py-2 text-left text-red-700 hover:bg-red-50">Delete question</button>
        </div>
      </details>
    </div>
  );
}

function QuestionBody({ question, locale, onChange }: { question: Question; locale: Locale; onChange: (patch: Partial<Question>) => void }) {
  const meta = QUESTION_META[question.type];
  return (
    <div className="space-y-4">
      <LocalizedField
        label="Question"
        hint={meta.hint}
        locale={locale}
        value={question.label}
        onChange={(label) => onChange({ label })}
        textarea={question.type === "long_text"}
      />
      <LocalizedField
        label="Help text"
        locale={locale}
        value={question.helpText ?? {}}
        onChange={(helpText) => onChange({ helpText })}
        placeholder="Optional explanation shown below the question"
      />
      {needsOptions(question.type) && <OptionsEditor question={question} locale={locale} onChange={onChange} />}
      {question.type === "rating" && <ScaleEditor question={question} locale={locale} onChange={onChange} />}
      {question.type === "matrix" && <MatrixEditor question={question} locale={locale} onChange={onChange} />}
    </div>
  );
}

function DesignQuestionBody({ question, locale, onChange }: { question: Question; locale: Locale; onChange: (patch: Partial<Question>) => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-[#f2f8fb] p-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="grid h-40 w-full shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-white sm:w-48">
            {question.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={question.imageUrl} alt="Design stimulus preview" className="max-h-full max-w-full object-contain" />
            ) : (
              <div className="text-center text-slate-400">
                <Icon name="image" size={28} className="mx-auto" />
                <p className="mt-2 text-xs">No design added</p>
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <p className="text-sm font-semibold">Design stimulus</p>
              <p className="mt-1 text-xs text-slate-500">Paste an image URL or data URI. Participant first click is recorded.</p>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-700">Image URL</span>
              <Textarea rows={3} value={question.imageUrl ?? ""} onChange={(event) => onChange({ imageUrl: event.target.value })} placeholder="https://..." />
            </label>
          </div>
        </div>
      </div>
      <LocalizedField label="Task instruction" hint="Tell participants what to find or do in the design." locale={locale} value={question.taskText ?? {}} onChange={(taskText) => onChange({ taskText })} />
      <LocalizedField label="Question" locale={locale} value={question.label} onChange={(label) => onChange({ label })} placeholder="Optional follow-up label" />
    </div>
  );
}

function LocalizedField({
  label, hint, locale, value, onChange, placeholder, textarea = false,
}: {
  label: string;
  hint?: string;
  locale: Locale;
  value: { da?: string; en?: string };
  onChange: (value: { da?: string; en?: string }) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-800">{label}</span>
      {hint && <span className="mb-2 block text-[11px] text-slate-500">{hint}</span>}
      {textarea ? (
        <Textarea rows={3} value={value[locale] ?? ""} onChange={(event) => onChange({ ...value, [locale]: event.target.value })} placeholder={placeholder} />
      ) : (
        <Input value={value[locale] ?? ""} onChange={(event) => onChange({ ...value, [locale]: event.target.value })} placeholder={placeholder} className="h-9.5" />
      )}
    </label>
  );
}

function OptionsEditor({ question, locale, onChange }: { question: Question; locale: Locale; onChange: (patch: Partial<Question>) => void }) {
  const options = question.options ?? [];
  const numericOptions = question.type === "likert" || question.type === "matrix";
  return (
    <div>
      <Label className="mb-2 text-slate-800">Choices</Label>
      <div className="space-y-2">
        {options.map((option, index) => (
          <div key={option.id} className="flex items-center gap-2">
            <span className="cursor-grab text-slate-400"><Icon name="grip" size={14} /></span>
            <Input
              aria-label={`Choice ${index + 1}`}
              value={option.label[locale] ?? ""}
              onChange={(event) => {
                const next = structuredClone(options);
                next[index].label[locale] = event.target.value;
                onChange({ options: next });
              }}
              className="h-9"
            />
            {numericOptions && (
              <Input
                aria-label={`Choice ${index + 1} numeric value`}
                type="number"
                value={option.value === undefined ? "" : String(option.value)}
                onChange={(event) => {
                  const next = structuredClone(options);
                  next[index].value = event.target.value === "" ? undefined : Number(event.target.value);
                  onChange({ options: next });
                }}
                className="h-9 w-24"
              />
            )}
            <button type="button" aria-label={`Delete choice ${index + 1}`} onClick={() => onChange({ options: options.filter((_, itemIndex) => itemIndex !== index) })} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-700"><Icon name="trash" size={14} /></button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Button size="sm" variant="secondary" onClick={() => onChange({ options: [...options, { id: nextId("opt"), label: { da: "", en: "" }, ...(numericOptions ? { value: options.length + 1 } : {}) }] })}>
          Add another choice
        </Button>
        <label className="inline-flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={question.randomizeOptions ?? false} onChange={(event) => onChange({ randomizeOptions: event.target.checked })} />
          Randomize order of choices
        </label>
      </div>
    </div>
  );
}

function ScaleEditor({ question, locale, onChange }: { question: Question; locale: Locale; onChange: (patch: Partial<Question>) => void }) {
  const scale = question.scale ?? { min: 0, max: 10 };
  return (
    <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
      <Label className="self-center text-slate-700">Start value</Label>
      <div className="flex gap-2">
        <Input type="number" value={scale.min} onChange={(event) => onChange({ scale: { ...scale, min: Number(event.target.value) } })} className="h-9 w-20" />
        <Input value={scale.minLabel?.[locale] ?? ""} onChange={(event) => onChange({ scale: { ...scale, minLabel: { ...(scale.minLabel ?? {}), [locale]: event.target.value } } })} placeholder="Low-end label" className="h-9" />
      </div>
      <Label className="self-center text-slate-700">End value</Label>
      <div className="flex gap-2">
        <Input type="number" value={scale.max} onChange={(event) => onChange({ scale: { ...scale, max: Number(event.target.value) } })} className="h-9 w-20" />
        <Input value={scale.maxLabel?.[locale] ?? ""} onChange={(event) => onChange({ scale: { ...scale, maxLabel: { ...(scale.maxLabel ?? {}), [locale]: event.target.value } } })} placeholder="High-end label" className="h-9" />
      </div>
    </div>
  );
}

function MatrixEditor({ question, locale, onChange }: { question: Question; locale: Locale; onChange: (patch: Partial<Question>) => void }) {
  const rows = question.rows ?? [];
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div>
        <Label className="mb-2 text-slate-800">Rows</Label>
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={row.id} className="flex gap-2">
              <Input value={row.label[locale] ?? ""} onChange={(event) => {
                const next = structuredClone(rows);
                next[index].label[locale] = event.target.value;
                onChange({ rows: next });
              }} />
              <button type="button" aria-label={`Delete row ${index + 1}`} onClick={() => onChange({ rows: rows.filter((_, itemIndex) => itemIndex !== index) })} className="text-slate-400 hover:text-red-700"><Icon name="trash" /></button>
            </div>
          ))}
        </div>
        <Button size="sm" variant="secondary" className="mt-2" onClick={() => onChange({ rows: [...rows, { id: nextId("row"), label: { da: "", en: "" } }] })}>Add row</Button>
      </div>
      <div>
        <Label className="mb-2 text-slate-800">Columns</Label>
        <p className="mb-2 text-[11px] text-slate-500">Matrix columns use choices above.</p>
        <OptionsEditor question={question} locale={locale} onChange={onChange} />
      </div>
    </div>
  );
}

function LogicEditor({
  open, question, priorQuestions, laterQuestions, onChange,
}: {
  open: boolean;
  question: Question;
  priorQuestions: Question[];
  laterQuestions: Question[];
  onChange: (patch: Partial<Question>) => void;
}) {
  if (!open) return null;
  return (
    <section className="mt-4 border-t border-slate-200 pt-3" aria-label={`Logic rules for ${question.code}`}>
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-700">
        <Icon name="logic" size={14} />
        Logic rules
        <span className="ml-auto text-[11px] font-normal text-slate-500">Display conditions and answer routing</span>
      </div>
      <div className="grid gap-4 rounded-lg bg-slate-50 p-3 xl:grid-cols-2">
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Show this question if</p>
          <ConditionRows conditions={question.visibleIf ?? []} candidates={priorQuestions} onChange={(visibleIf) => onChange({ visibleIf })} />
        </div>
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">After answering, jump</p>
          <div className="space-y-2">
            {(question.branches ?? []).map((branch, index) => (
              <div key={branch.id} className="flex flex-wrap items-center gap-2">
                <Select aria-label="Branch operator" value={branch.when[0]?.op ?? "eq"} onChange={(event) => {
                  const branches = structuredClone(question.branches ?? []);
                  branches[index].when = [{ questionCode: question.code, op: event.target.value as typeof CONDITION_OPS[number], value: branch.when[0]?.value }];
                  onChange({ branches });
                }} className="h-8 text-xs">
                  {CONDITION_OPS.map((operator) => <option key={operator} value={operator}>{operator}</option>)}
                </Select>
                <Input aria-label="Branch value" value={String(branch.when[0]?.value ?? "")} onChange={(event) => {
                  const branches = structuredClone(question.branches ?? []);
                  const raw = event.target.value;
                  const numeric = Number(raw);
                  branches[index].when = [{ questionCode: question.code, op: branch.when[0]?.op ?? "eq", value: raw !== "" && !Number.isNaN(numeric) ? numeric : raw }];
                  onChange({ branches });
                }} className="h-8 min-w-24 flex-1 text-xs" />
                <Select aria-label="Branch target" value={branch.goTo} onChange={(event) => {
                  const branches = structuredClone(question.branches ?? []);
                  branches[index].goTo = event.target.value;
                  onChange({ branches });
                }} className="h-8 min-w-32 flex-1 text-xs">
                  {laterQuestions.map((candidate) => <option key={candidate.code} value={candidate.code}>{candidate.code}</option>)}
                  <option value="END">Thank you screen</option>
                  <option value="DISQUALIFY">Disqualify</option>
                </Select>
                <button type="button" aria-label="Delete branch" onClick={() => onChange({ branches: (question.branches ?? []).filter((_, itemIndex) => itemIndex !== index) })} className="text-slate-400 hover:text-red-700"><Icon name="trash" size={14} /></button>
              </div>
            ))}
          </div>
          <Button size="sm" variant="secondary" className="mt-2" onClick={() => onChange({
            branches: [...(question.branches ?? []), { id: nextId("branch"), when: [{ questionCode: question.code, op: "eq", value: "" }], goTo: "END" }],
          })}>Add routing rule</Button>
        </div>
      </div>
    </section>
  );
}

function ConditionRows({
  conditions, candidates, onChange,
}: {
  conditions: NonNullable<Question["visibleIf"]>;
  candidates: Question[];
  onChange: (conditions: NonNullable<Question["visibleIf"]>) => void;
}) {
  return (
    <div>
      <div className="space-y-2">
        {conditions.map((condition, index) => (
          <div key={`${condition.questionCode}-${index}`} className="flex flex-wrap gap-2">
            <Select aria-label="Condition question" value={condition.questionCode} onChange={(event) => {
              const next = structuredClone(conditions);
              next[index].questionCode = event.target.value;
              onChange(next);
            }} className="h-8 min-w-36 flex-1 text-xs">
              {candidates.map((candidate) => <option key={candidate.code} value={candidate.code}>{candidate.code}</option>)}
            </Select>
            <Select aria-label="Condition operator" value={condition.op} onChange={(event) => {
              const next = structuredClone(conditions);
              next[index].op = event.target.value as typeof condition.op;
              onChange(next);
            }} className="h-8 text-xs">
              {CONDITION_OPS.map((operator) => <option key={operator} value={operator}>{operator}</option>)}
            </Select>
            <Input aria-label="Condition value" value={String(condition.value ?? "")} disabled={condition.op === "answered"} onChange={(event) => {
              const next = structuredClone(conditions);
              const raw = event.target.value;
              const numeric = Number(raw);
              next[index].value = raw !== "" && !Number.isNaN(numeric) ? numeric : raw;
              onChange(next);
            }} className="h-8 min-w-24 flex-1 text-xs" />
            <button type="button" aria-label="Delete condition" onClick={() => onChange(conditions.filter((_, itemIndex) => itemIndex !== index))} className="text-slate-400 hover:text-red-700"><Icon name="trash" size={14} /></button>
          </div>
        ))}
      </div>
      {candidates.length > 0 ? (
        <Button size="sm" variant="secondary" className="mt-2" onClick={() => onChange([...conditions, { questionCode: candidates[0].code, op: "eq", value: "" }])}>Add display condition</Button>
      ) : (
        <p className="text-[11px] text-slate-500">Add an earlier question before creating a display condition.</p>
      )}
    </div>
  );
}

function Toggle(props: { checked: boolean; onChange?: (checked: boolean) => void; readOnly?: boolean; "aria-label": string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props["aria-label"]}
      aria-readonly={props.readOnly || undefined}
      onClick={props.readOnly ? undefined : () => props.onChange?.(!props.checked)}
      className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", props.checked ? "bg-[#07828a]" : "bg-slate-300", props.readOnly ? "cursor-default" : "cursor-pointer")}
    >
      <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform", props.checked ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}

type IconName = "arrow-left" | "eye" | "eye-off" | "save" | "details" | "spark" | "grip" | "image" | "question" | "thumb" | "info" | "plus-circle" | "more" | "plus" | "logic" | "trash";

function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  let content: ReactNode;
  switch (name) {
    case "arrow-left": content = <><path d="m15 18-6-6 6-6" /><path d="M9 12h10" /></>; break;
    case "eye": content = <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>; break;
    case "eye-off": content = <><path d="m3 3 18 18" /><path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.1 2.8M6.2 6.2C3.8 8 2.5 12 2.5 12s3.5 6 9.5 6a10.6 10.6 0 0 0 3.2-.5" /></>; break;
    case "save": content = <><path d="M5 3h12l2 2v16H5Z" /><path d="M8 3v6h8V3M8 21v-7h8v7" /></>; break;
    case "details": content = <><path d="M5 7h14M5 12h14M5 17h9" /></>; break;
    case "spark": content = <><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /><circle cx="12" cy="12" r="4" /></>; break;
    case "grip": content = <><circle cx="8" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="16" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="8" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="16" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="8" cy="18" r="1" fill="currentColor" stroke="none" /><circle cx="16" cy="18" r="1" fill="currentColor" stroke="none" /></>; break;
    case "image": content = <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m5 18 5-5 3 3 2-2 4 4" /></>; break;
    case "question": content = <><circle cx="12" cy="12" r="9" /><path d="M9.8 9a2.3 2.3 0 1 1 3.2 2.1c-.7.3-1 1-1 1.9M12 17h.01" /></>; break;
    case "thumb": content = <><path d="M7 10v11H3V10h4ZM7 19h9.5a2 2 0 0 0 2-1.6l1.3-6A2 2 0 0 0 17.8 9H14l.5-3A2.6 2.6 0 0 0 12 3l-1 4-4 4" /></>; break;
    case "info": content = <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>; break;
    case "plus-circle": content = <><circle cx="12" cy="12" r="9" /><path d="M8 12h8M12 8v8" /></>; break;
    case "more": content = <><circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" /></>; break;
    case "plus": content = <path d="M5 12h14M12 5v14" />; break;
    case "logic": content = <><path d="M5 6h5a3 3 0 0 1 3 3v6a3 3 0 0 0 3 3h3" /><path d="m16 15 3 3-3 3M5 18h3" /></>; break;
    case "trash": content = <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" /></>; break;
  }
  return <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>{content}</svg>;
}

function OutcomeMessages({
  locale, definition, mutate,
}: {
  locale: Locale;
  definition: InstrumentDefinition;
  mutate: (change: (draft: InstrumentDefinition) => void) => void;
}) {
  return (
    <details className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-slate-700">
        <Icon name="details" size={14} /> Other outcome messages
        <span className="ml-auto text-xs font-normal text-slate-500">Disqualified and closed</span>
      </summary>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <LocalizedField
          label="Disqualified message"
          locale={locale}
          value={definition.messages?.disqualified ?? {}}
          onChange={(disqualified) => mutate((draft) => { draft.messages = { ...draft.messages, disqualified }; })}
          textarea
        />
        <LocalizedField
          label="Closed study message"
          locale={locale}
          value={definition.messages?.closed ?? {}}
          onChange={(closed) => mutate((draft) => { draft.messages = { ...draft.messages, closed }; })}
          textarea
        />
      </div>
    </details>
  );
}
