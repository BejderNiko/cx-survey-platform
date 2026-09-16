import Link from "next/link";
import { notFound } from "next/navigation";
import { allQuestions, assertCan, can, computeNps, instrumentDefinition, lt, type Condition, type Question } from "@ok/domain";
import type { ReactNode } from "react";
import { Card, KpiTile, Table, Td, Th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { loadLatestResultData } from "@/lib/results-data";
import { buildPrototypePaths, groupCommonPaths, type PrototypeInteractionRow } from "@/lib/prototype-results";
import { PrototypeResultView } from "./prototype-result-view";
import {
  draftFiltersFromNaturalLanguage,
  filterResponses,
  mergeResultFilters,
  parseResultFiltersDetailed,
  resultFilterCodecMessage,
  resultFilterKey,
  resultFilterLabel,
  serializeResultFilters,
  trySerializeResultFilters,
  type FilterableResponse,
  type ResultFilter,
} from "@/lib/results-filters";
import { ReportJobs } from "./report-jobs";
import { OpenAnswerSearch } from "./open-answer-search";
import { ResultCommentPopover } from "./result-comment-popover";
import type { StudyCommentRow } from "../comments-panel";

type Search = { filters?: string; ask?: string; filterError?: string };
type FirstClickInteraction = { response_id?: unknown; payload: unknown };

export async function ResultsDashboard({ studyId, search }: { studyId: string; search: Search }) {
  const session = await requireSession();
  assertCan(session.role, "responses.view");
  const data = await withUser(session.userId, session.orgId, (tx) => loadLatestResultData(tx, session.orgId, studyId));
  if (!data) notFound();

  const pathLabelRows = data.version ? await withUser(session.userId, session.orgId, (tx) => tx`select question_code, path_signature, label from prototype_path_labels where org_id = ${session.orgId} and study_version_id = ${data.version.id}`).catch((error) => {
    if (error && typeof error === "object" && "code" in error && error.code === "42P01") return [];
    throw error;
  }) : [];
  const pathLabels = new Map(pathLabelRows.map((row) => [`${row.question_code}\u0000${row.path_signature}`, String(row.label)]));
  const resultComments = await withUser(session.userId, session.orgId, (tx) => tx`select c.id, c.parent_id,
             case when c.question_code like '__section__:%' then null else c.question_code end as question_code,
             case when to_jsonb(c)->>'section_id' is not null then to_jsonb(c)->>'section_id'
                  when c.question_code like '__section__:%' then substring(c.question_code from 12)
                  else null end as section_id, c.body, c.status,
             c.author_id, c.created_at::text, c.resolved_at::text, coalesce(u.full_name, 'Former user') as author,
             resolver.full_name as resolved_by_name
      from comments c
      left join users u on u.id = c.author_id
      left join users resolver on resolver.id = c.resolved_by
      where c.study_id = ${studyId} and c.org_id = ${session.orgId}
      order by c.created_at asc limit 500`);
  const resultCommentRows = resultComments as unknown as StudyCommentRow[];
  const canResolveComments = can(session.role, "comments.resolve");
  const parsed = instrumentDefinition.safeParse(data.version?.definition ?? data.study.draft_definition);
  if (!parsed.success) return <Card title="Studiedata kunne ikke læses"><p role="alert">Instrumentet er ugyldigt.</p></Card>;
  const definition = parsed.data;
  const prototypeRows: PrototypeInteractionRow[] = data.interactions.map((row) => ({
    responseId: String(row.response_id), questionCode: String(row.question_code), eventType: String(row.event_type), payload: row.payload as Record<string, unknown>,
  }));
  const pathsByQuestion = new Map<string, ReturnType<typeof buildPrototypePaths>>();
  for (const question of allQuestions(definition).filter((item) => item.type === "prototype_test")) {
    pathsByQuestion.set(question.code, buildPrototypePaths(prototypeRows, question.code));
  }
  const answersByResponse = new Map<string, Record<string, unknown>>();
  for (const answer of data.answers) {
    const id = String(answer.response_id);
    answersByResponse.set(id, { ...(answersByResponse.get(id) ?? {}), [String(answer.question_code)]: answer.value });
  }
  const responseRows = data.responses.map((row) => {
    const id = String(row.id);
    const paths: Record<string, string> = {};
    for (const [code, entries] of pathsByQuestion) paths[code] = entries.find((entry) => entry.responseId === id)?.signature ?? "";
    return {
      id,
      answers: answersByResponse.get(id) ?? {},
      tags: (row.tags as unknown[]).map(String),
      paths,
      facets: {
        location: String(row.location),
        ageRange: String(row.age_range),
        source: String(row.source),
      },
      source: row,
    } satisfies FilterableResponse & { source: typeof row };
  });

  const parsedFilterState = parseResultFiltersDetailed(search.filters);
  const filters = parsedFilterState.filters;
  const filterError = !parsedFilterState.ok
    ? parsedFilterState.message
    : search.filterError && ["invalid", "too_many", "too_large"].includes(search.filterError)
      ? resultFilterCodecMessage(search.filterError as "invalid" | "too_many" | "too_large")
      : null;
  const serializedFilters = serializeResultFilters(filters);
  const filtered = filterResponses(responseRows, filters);
  const filteredIds = new Set(filtered.map((response) => response.id));
  const questionValues = (code: string) => filtered.flatMap((response) => response.answers[code] === undefined ? [] : [response.answers[code]]);
  const hrefFor = (nextFilters: ResultFilter[]) => resultHref(studyId, nextFilters, filters);
  const insightDraft = search.ask ? buildInsightDraft(search.ask, definition, questionValues) : null;
  const draft = search.ask && !insightDraft ? draftFiltersFromNaturalLanguage(search.ask, definition) : null;
  const draftFilters = draft?.filters ?? [];
  const combinedDraft = mergeResultFilters(filters, draftFilters);
  const firstClickByQuestion = new Map<string, FirstClickInteraction[]>();
  for (const interaction of data.interactions) {
    if (String(interaction.event_type) !== "first_click" || !filteredIds.has(String(interaction.response_id))) continue;
    const click: FirstClickInteraction = { response_id: interaction.response_id, payload: interaction.payload };
    const key = String(interaction.question_code);
    firstClickByQuestion.set(key, [...(firstClickByQuestion.get(key) ?? []), click]);
  }
  const openAnswerItems = data.answers.flatMap((answer) => {
    const question = allQuestions(definition).find((item) => item.code === String(answer.question_code));
    const responseId = String(answer.response_id);
    if (!question || !["short_text", "long_text"].includes(question.type) || !filteredIds.has(responseId)) return [];
    const text = typeof answer.value === "string" || typeof answer.value === "number" ? String(answer.value) : "";
    return text.trim() ? [{ responseId, questionCode: question.code, questionLabel: lt(question.label, definition.defaultLanguage) || question.code, text }] : [];
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {data.version ? `Instrumentversion v${data.version.version_number}` : "Kladde"} · alle beregninger bruger samme filtrerede mængde.
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label={filters.length ? "Svar vist - FILTRERET" : "Svar vist"} value={String(filtered.length)} hint={`${filtered.length} / ${responseRows.length} gennemførte`} />
        <KpiTile label="Deltagere" value={String(responseRows.length)} hint="Bounded version-population" />
        <KpiTile label="Andel vist" value={`${fmtNumber(responseRows.length ? filtered.length / responseRows.length * 100 : 0, 1)} %`} hint={`${filtered.length} ÷ ${responseRows.length || 0}`} />
        <KpiTile label="Status" value={String(data.study.status)} hint={`${filters.length} aktive filtre`} />
      </div>

      <Card title="Globale filtre">
        {filterError && <p role="alert" className="mb-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">{filterError} Den ønskede filterændring er ikke anvendt; gyldige aktive filtre er bevaret.</p>}
        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <Link key={resultFilterKey(filter)} href={hrefFor(filters.filter((item) => resultFilterKey(item) !== resultFilterKey(filter)))} className="rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-xs text-accent">
              {resultFilterLabel(filter, definition)} ×
            </Link>
          ))}
          {filters.length === 0 && <span className="text-sm text-muted">Ingen filtre. Klik tragt ved svar, path, location, alder, kilde eller paneltag.</span>}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <form action={`/studies/${studyId}/results`} className="space-y-2">
            {filters.length > 0 && <input type="hidden" name="filters" value={serializedFilters} />}
            <label className="block text-xs font-semibold">Filter- eller indsigtønske i naturligt sprog</label>
            <div className="flex gap-2">
              <input name="ask" defaultValue={search.ask ?? ""} maxLength={500} placeholder="Fx nps = 10, tag = Elbil eller indsigt om nps" className="h-9 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-sm" />
              <button className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-white">Lav udkast</button>
            </div>
          </form>
          <div className="text-xs text-muted">
            {insightDraft ? <><p className="font-medium text-heading">{insightDraft.text}</p><p className="mt-1">Grundlag: {insightDraft.basis}</p><p className="mt-1">Proveniens: {insightDraft.provenance}</p><p className="mt-2">Kun preview; ingen filtre, analysejob eller rapport ændres automatisk.</p></> : draft ? <><p>{draft.explanation}</p><p className="mt-1">Proveniens: {draft.provenance}</p>{draftFilters.length > 0 && <Link href={hrefFor(combinedDraft)} className="mt-2 inline-flex rounded-md border border-line px-3 py-1.5 font-medium text-heading">Bekræft og anvend udkast</Link>}</> : <p>Udkast ændrer intet før bekræftelse. Chips kan fjernes bagefter.</p>}
          </div>
        </div>      </Card>
      {allQuestions(definition).map((question) => question.type === "prototype_test" ? (
        <PrototypeResult key={question.code} studyId={studyId} studyVersionId={data.version ? String(data.version.id) : ""} question={question} logicText={logicTextForQuestion(question, definition)} values={questionValues(question.code)} paths={(pathsByQuestion.get(question.code) ?? []).filter((path) => filteredIds.has(path.responseId))} filters={filters} canRenamePaths={can(session.role, "reports.create")} pathLabels={Object.fromEntries([...pathLabels].filter(([key]) => key.startsWith(`${question.code}\u0000`)).map(([key, value]) => [key.slice(question.code.length + 1), value]))} comments={resultCommentRows} canResolveComments={canResolveComments} currentUserId={session.userId} />
      ) : (
        <QuestionResult key={question.code} studyId={studyId} question={question} logicText={logicTextForQuestion(question, definition)} values={questionValues(question.code)} filters={filters} hrefFor={hrefFor} firstClickInteractions={firstClickByQuestion.get(question.code) ?? []} comments={resultCommentRows} canResolveComments={canResolveComments} currentUserId={session.userId} />
      ))}

      <OpenAnswerSearch items={openAnswerItems} />

      <ReportJobs studyId={studyId} filters={filters} />

      <Card title={`Individuelle besvarelser (${filtered.length})`}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs text-muted">Samme base som kort og diagrammer: n = {filtered.length}.</p>
          <Link href={`/api/studies/${studyId}/results/export?filters=${encodeURIComponent(serializedFilters)}`} className="rounded-md border border-line px-3 py-2 text-sm">{filtered.length} · Eksportér CSV</Link>
        </div>
        <Table><thead><tr><Th>Respondent</Th><Th>Version</Th><Th>Tags</Th><Th>Kanal</Th><Th>Påbegyndt</Th></tr></thead><tbody>
          {filtered.slice(0, 200).map(({ id, source }) => <tr key={id}>
            <Td>{source.panelist_id ? [source.first_name, source.last_name].filter(Boolean).join(" ") || "(anonymiseret)" : <span className="font-mono text-xs">{source.respondent_key}</span>}</Td>
            <Td>v{source.version_number}</Td><Td>{(source.tags as unknown[]).map(String).join(", ") || "—"}</Td><Td>{String(source.channel)}</Td><Td>{fmtDateTime(source.started_at)}</Td>
          </tr>)}
          {filtered.length === 0 && <tr><Td colSpan={5}>Ingen besvarelser matcher.</Td></tr>}
        </tbody></Table>
        {filtered.length > 200 && <p className="mt-2 text-xs text-muted">Viser 200 af {filtered.length}; CSV indeholder alle filtrerede svar.</p>}
      </Card>
    </div>
  );
}

function logicTextForQuestion(question: Question, definition: ReturnType<typeof instrumentDefinition.parse>): string | null {
  const block = definition.blocks.find((candidate) => candidate.questions.some((item) => item.code === question.code));
  const conditions = [...(block?.visibleIf ?? []), ...(question.visibleIf ?? [])];
  if (conditions.length === 0) return null;
  const mode = block?.visibleIfMode ?? question.visibleIfMode ?? "all";
  return "Logic: " + conditions.map((condition) => formatLogicCondition(condition, definition)).join(mode === "any" ? " OR " : " AND ");
}

function formatLogicCondition(condition: Condition, definition: ReturnType<typeof instrumentDefinition.parse>): string {
  const target = allQuestions(definition).find((item) => item.code === condition.questionCode);
  const targetLabel = target ? lt(target.label, definition.defaultLanguage) || target.code : condition.questionCode;
  const effects = condition.effect === "hide" ? "Hide when" : "Show when";
  const operators: Record<Condition["op"], string> = {
    eq: "equals", ne: "does not equal", lt: "is less than", lte: "is at most", gt: "is greater than", gte: "is at least",
    in: "is one of", not_in: "is not one of", contains: "contains", answered: "is answered", not_answered: "is not answered",
  };
  if (condition.op === "answered" || condition.op === "not_answered") return effects + " " + targetLabel + " " + operators[condition.op];
  return effects + " " + targetLabel + " " + operators[condition.op] + " " + formatLogicValue(condition.value);
}

function formatLogicValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => formatLogicValue(item)).join(", ");
  if (typeof value === "string") return "\"" + value + "\"";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null || value === undefined) return "empty";
  return String(value);
}

function QuestionResult({ studyId, question, logicText, values, filters, hrefFor, firstClickInteractions, comments, canResolveComments, currentUserId }: { studyId: string; question: Question; logicText: string | null; values: unknown[]; filters: ResultFilter[]; hrefFor: (filters: ResultFilter[]) => string; firstClickInteractions: { payload: unknown }[]; comments: StudyCommentRow[]; canResolveComments: boolean; currentUserId: string }) {
  const title = <span>{lt(question.label, "da") || question.code} {logicText && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">{logicText}</span>} <span className="text-xs font-normal text-muted">n = {values.length}</span><ResultCommentPopover studyId={studyId} questionCode={question.code} comments={comments} canResolve={canResolveComments} currentUserId={currentUserId} /></span>;
  if (question.type === "nps") {
    const result = computeNps(values);
    return <Card title={title}><div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4"><KpiTile label="NPS" value={result.score === null ? "—" : fmtNumber(result.score)} hint={`(${result.promoters} − ${result.detractors}) / ${result.valid}`} /><KpiTile label="Ambassadører" value={String(result.promoters)} /><KpiTile label="Passive" value={String(result.passives)} /><KpiTile label="Kritikere" value={String(result.detractors)} /></div><Bars question={question} options={Array.from({ length: 11 }, (_, value) => ({ value: String(value), label: String(value) }))} values={values} filters={filters} hrefFor={hrefFor} /></Card>;
  }
  if (["single_choice", "dropdown", "likert", "multiple_choice"].includes(question.type)) {
    const options = (question.options ?? []).map((option) => ({ value: String(question.type === "likert" ? option.value ?? option.id : option.id), label: lt(option.label, "da") || option.id }));
    return <Card title={title}><Bars question={question} options={options} values={values} filters={filters} hrefFor={hrefFor} /></Card>;
  }
  if (question.type === "consent") return <Card title={title}><Bars question={question} options={[{ value: "true", label: "Ja" }, { value: "false", label: "Nej" }]} values={values} filters={filters} hrefFor={hrefFor} /></Card>;
  if (question.type === "first_click") return <FirstClickHeatmap title={title} interactions={firstClickInteractions} />;
  const numeric = values.map(Number).filter(Number.isFinite);
  return <Card title={title}><p className="text-sm text-muted">Svar: {values.length}{numeric.length ? ` · gennemsnit ${fmtNumber(numeric.reduce((sum, value) => sum + value, 0) / numeric.length, 2)} (${numeric.reduce((sum, value) => sum + value, 0)} ÷ ${numeric.length})` : ""}</p></Card>;
}

function FirstClickHeatmap({ title, interactions }: { title: ReactNode; interactions: FirstClickInteraction[] }) {
  const clicks = interactions.map((item) => item.payload as Record<string, unknown>).map((payload) => {
    const width = Number(payload.naturalWidth) || 1;
    const height = Number(payload.naturalHeight) || 1;
    return { x: Math.max(0, Math.min(100, Number(payload.x) / width * 100)), y: Math.max(0, Math.min(100, Number(payload.y) / height * 100)) };
  }).filter((click) => Number.isFinite(click.x) && Number.isFinite(click.y));
  return <Card title={title}><div className="relative aspect-video overflow-hidden rounded-lg border border-line bg-[#f7efeb]" aria-label="Heatmap over første klik"><div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(70,0,25,.06),transparent_65%)]" />{clicks.map((click, index) => <span key={index} className="absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500/40 blur-md" style={{ left: `${click.x}%`, top: `${click.y}%` }} />)}</div><p className="mt-2 text-xs text-muted">{clicks.length} klik · x = billedbredde · y = billedhøjde. Nævner: filtrerede første-klik-events.</p></Card>;
}
function Bars({ question, options, values, filters, hrefFor }: { question: Question; options: { value: string; label: string }[]; values: unknown[]; filters: ResultFilter[]; hrefFor: (filters: ResultFilter[]) => string }) {
  const counts = new Map<string, number>();
  for (const raw of values) for (const value of Array.isArray(raw) ? raw : [raw]) counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
  const max = Math.max(1, ...counts.values());
  return <div className="space-y-1.5">{options.map((option) => {
    const count = counts.get(option.value) ?? 0;
    const filter: ResultFilter = { kind: "answer", questionCode: question.code, value: option.value };
    const active = filters.some((item) => resultFilterKey(item) === resultFilterKey(filter));
    return <div key={option.value} className={count === 0 ? "opacity-45" : ""}><div className="flex items-center gap-2 text-sm"><span className="w-44 truncate" title={option.label}>{option.label}</span><div className="h-4 flex-1 overflow-hidden rounded bg-background"><div className="h-full rounded bg-accent/80" style={{ width: `${count / max * 100}%` }} /></div><span className="w-24 text-right tabular-nums">{count} · {values.length ? fmtNumber(count / values.length * 100, 1) : 0} %</span><Link aria-label={`Filtrér på ${option.label}`} href={hrefFor(mergeFilters(filters, [filter]))} className={active ? "text-accent" : "text-muted"}>▽</Link></div></div>;
  })}</div>;
}

function PrototypeResult({ studyId, studyVersionId, question, logicText, values, paths, filters, canRenamePaths, pathLabels, comments, canResolveComments, currentUserId }: { studyId: string; studyVersionId: string; question: Question; logicText: string | null; values: unknown[]; paths: ReturnType<typeof buildPrototypePaths>; filters: ResultFilter[]; canRenamePaths: boolean; pathLabels: Record<string, string>; comments: StudyCommentRow[]; canResolveComments: boolean; currentUserId: string }) {
  const groups = groupCommonPaths(paths);
  const goalFrameId = question.prototype?.goalFrameId;
  const successes = goalFrameId ? paths.filter((path) => path.frames.includes(goalFrameId)).length : 0;
  const clicks = paths.flatMap((path) => path.clicks);
  const misclicks = clicks.filter((click) => click.isMisclick).length;
  const averageElapsedMs = paths.length ? paths.reduce((sum, path) => sum + path.elapsedMs, 0) / paths.length : 0;
  const screenshots = (question.prototype?.frameScreenshots ?? []).flatMap((entry) => entry.screenshot ? [{ frameId: entry.frameId, frameName: entry.frameName, assetId: entry.screenshot.assetId, coordinateScale: entry.coordinateScale }] : []);
  return <Card title={<span>{lt(question.label, "da") || question.code} {logicText && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">{logicText}</span>} <span className="text-xs font-normal text-muted">n = {values.length}</span><ResultCommentPopover studyId={studyId} questionCode={question.code} comments={comments} canResolve={canResolveComments} currentUserId={currentUserId} /></span>}>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5"><KpiTile label={question.prototype?.flowType === "free" ? "Flow" : "Mål nået"} value={question.prototype?.flowType === "free" ? "Free" : `${values.length ? fmtNumber(successes / values.length * 100, 1) : 0} %`} hint={question.prototype?.flowType === "free" ? "Intet goal-krav" : `${successes} ÷ ${values.length}`} /><KpiTile label="Deltagere" value={String(values.length)} /><KpiTile label="Gennemsnitstid" value={`${fmtNumber(averageElapsedMs / 1000, 1)} s`} hint={`${fmtNumber(paths.reduce((sum, path) => sum + path.elapsedMs, 0) / 1000, 1)} s ÷ ${paths.length}`} /><KpiTile label="Klik" value={String(clicks.length)} hint={`${misclicks} fejlklik · ${clicks.length ? fmtNumber(misclicks / clicks.length * 100, 1) : 0} %`} /><KpiTile label="Fælles paths" value={String(groups.length)} /></div>
    <PrototypeResultView studyId={studyId} studyVersionId={studyVersionId} questionCode={question.code} flowType={question.prototype?.flowType ?? "task"} goalFrameId={goalFrameId} paths={paths} filters={filters} screenshots={screenshots} canRenamePaths={canRenamePaths} pathLabels={pathLabels} />
    <p className="mt-3 text-xs text-muted">Path-succes beregnes som ‘goal frame set mindst én gang’. Screenshot-overlay bruger kun godkendte private-storage assets. Koordinatskala skal matche Figma-frame og screenshot-export; live alignment er ikke verificeret uden rigtig prototype.</p>
  </Card>;
}
type InsightDraft = { text: string; basis: string; provenance: string };

function buildInsightDraft(
  input: string,
  definition: ReturnType<typeof instrumentDefinition.parse>,
  valuesFor: (code: string) => unknown[],
): InsightDraft | null {
  const match = input.trim().match(/^(?:indsigt|insight)\s+(?:om\s+)?(.+)$/iu);
  if (!match?.[1] || input.length > 500) return null;
  const needle = normalizeInsightNeedle(match[1]);
  const question = allQuestions(definition).find((item) => {
    const label = normalizeInsightNeedle(lt(item.label, definition.defaultLanguage));
    return normalizeInsightNeedle(item.code) === needle || label === needle || label.includes(needle);
  });
  if (!question) return { text: `Intet spørgsmål matcher “${match[1].trim()}”.`, basis: "n = 0", provenance: "Lokal, deterministisk beregning på aktivt filtreret svarmængde." };
  const values = valuesFor(question.code);
  const label = lt(question.label, definition.defaultLanguage) || question.code;
  const provenance = "Lokal, deterministisk beregning på aktivt filtreret svarmængde; ingen svardata sendt ud af platformen.";
  if (question.type === "nps") {
    const nps = computeNps(values);
    const text = nps.score === null ? `${label}: ingen gyldige NPS-svar.` : `${label}: NPS ${fmtNumber(nps.score)}.`;
    return { text, basis: `(${nps.promoters} ambassadører − ${nps.detractors} kritikere) ÷ ${nps.valid} gyldige svar × 100`, provenance };
  }
  if (question.options?.length) {
    const counts = question.options.map((option) => {
      const optionValue = String(option.value ?? option.id);
      const count = values.filter((value) => Array.isArray(value) ? value.map(String).includes(optionValue) : String(value) === optionValue).length;
      return { label: lt(option.label, definition.defaultLanguage), count };
    }).sort((left, right) => right.count - left.count);
    const top = counts[0];
    const share = values.length ? top.count / values.length * 100 : 0;
    return { text: `${label}: mest valgte svar er ${top.label} (${top.count}; ${fmtNumber(share, 1)} %).`, basis: `${top.count} ÷ ${values.length || 0} svar`, provenance };
  }
  const numeric = values.map(Number).filter(Number.isFinite);
  if (numeric.length) {
    const sum = numeric.reduce((total, value) => total + value, 0);
    return { text: `${label}: gennemsnit ${fmtNumber(sum / numeric.length, 1)}.`, basis: `${fmtNumber(sum, 1)} ÷ ${numeric.length} numeriske svar`, provenance };
  }
  return { text: `${label}: ${values.length} svar i aktiv base.`, basis: `n = ${values.length}`, provenance };
}

function normalizeInsightNeedle(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("da");
}

function mergeFilters(existing: ResultFilter[], additions: ResultFilter[]): ResultFilter[] {
  return mergeResultFilters(existing, additions);
}

function resultHref(studyId: string, filters: ResultFilter[], currentFilters: ResultFilter[]): string {
  const serialized = trySerializeResultFilters(filters);
  if (serialized.ok) {
    const query = filters.length ? `?filters=${encodeURIComponent(serialized.value)}` : "";
    return `/studies/${studyId}/results${query}`;
  }
  const fallback = serializeResultFilters(currentFilters);
  const params = new URLSearchParams();
  if (currentFilters.length) params.set("filters", fallback);
  params.set("filterError", serialized.error);
  return `/studies/${studyId}/results?${params}`;
}
