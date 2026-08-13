import Link from "next/link";
import { notFound } from "next/navigation";
import { allQuestions, assertCan, can, computeNps, instrumentDefinition, lt, type Question } from "@ok/domain";
import { Card, KpiTile, Table, Td, Th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { loadLatestResultData } from "@/lib/results-data";
import { buildPrototypePaths, groupCommonPaths, type PrototypeInteractionRow } from "@/lib/prototype-results";
import { PrototypeResultView } from "./prototype-result-view";
import {
  draftFiltersFromNaturalLanguage,
  facetCounts,
  facetLabel,
  filterResponses,
  mergeResultFilters,
  parseResultFiltersDetailed,
  RESULT_FACETS,
  resultFilterCodecMessage,
  resultFilterKey,
  resultFilterLabel,
  serializeResultFilters,
  trySerializeResultFilters,
  tagFacetCounts,
  type FilterableResponse,
  type ResultFilter,
} from "@/lib/results-filters";
import { ReportJobs } from "./report-jobs";

type Search = { filters?: string; ask?: string; filterError?: string };

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
  const dynamicTagCounts = tagFacetCounts(responseRows, filters);

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
      <Card title="Dynamiske facetter">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {RESULT_FACETS.map((facet) => <details key={facet}><summary className="mb-1 cursor-pointer text-xs font-semibold">{facetLabel(facet)} · vis flere/færre</summary><div className="flex flex-wrap gap-1">
            {facetCounts(responseRows, filters, facet).map((entry, index) => <label key={entry.value} className={`flex items-center gap-1 rounded border px-2 py-1 text-xs ${index >= 6 ? "[details:not([open])_&]:hidden" : ""} ${entry.active ? "border-accent bg-accent-soft text-accent" : "border-line"}`}><input type="checkbox" readOnly checked={entry.active} /><Link href={hrefFor(entry.active ? filters.filter((item) => resultFilterKey(item) !== resultFilterKey({ kind: "facet", facet, value: entry.value })) : mergeResultFilters(filters, [{ kind: "facet", facet, value: entry.value }]))}>{entry.value} · {entry.matching} OF {entry.total}</Link></label>)}
          </div></details>)}
          <div><p className="mb-1 text-xs font-semibold">Paneltags</p><div className="flex flex-wrap gap-1">
            {dynamicTagCounts.map((entry) => <Link key={entry.value} href={hrefFor(mergeResultFilters(filters, [{ kind: "tag", value: entry.value }]))} className={`rounded-full border px-2 py-1 text-xs ${entry.active ? "border-accent bg-accent-soft text-accent" : "border-line"}`}>⌁ {entry.value} · {entry.matching} OF {entry.total}</Link>)}
          </div></div>
        </div>
        <p className="mt-3 text-xs text-muted">Manuelle filtre kan stakkes; kompakt, versionsstyret encoding understøtter højst 64 filtre og 16.000 serialiserede tegn. Hvis tilstanden bliver større, beholdes aktive filtre og UI viser en fejl i stedet for at nulstille dem. Facetter viser op til alle værdier; lange lister kan åbnes/lukkes med browserens Details-kontrol. X = matcher facetværdien efter øvrige aktive filtre. Y = hele bounded version-populationen. Valg inden for samme facet erstatter tidligere valg; filtre på tværs kombineres med AND.</p>
      </Card>

      {allQuestions(definition).map((question) => question.type === "prototype_test" ? (
        <PrototypeResult key={question.code} studyId={studyId} studyVersionId={data.version ? String(data.version.id) : ""} question={question} values={questionValues(question.code)} paths={(pathsByQuestion.get(question.code) ?? []).filter((path) => filteredIds.has(path.responseId))} filters={filters} canRenamePaths={can(session.role, "reports.create")} pathLabels={Object.fromEntries([...pathLabels].filter(([key]) => key.startsWith(`${question.code}\u0000`)).map(([key, value]) => [key.slice(question.code.length + 1), value]))} />
      ) : (
        <QuestionResult key={question.code} question={question} values={questionValues(question.code)} filters={filters} hrefFor={hrefFor} />
      ))}

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

function QuestionResult({ question, values, filters, hrefFor }: { question: Question; values: unknown[]; filters: ResultFilter[]; hrefFor: (filters: ResultFilter[]) => string }) {
  const title = <span>{lt(question.label, "da") || question.code} {question.visibleIf?.length ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">LOGIC</span> : null} <span className="text-xs font-normal text-muted">n = {values.length}</span></span>;
  if (question.type === "nps") {
    const result = computeNps(values);
    return <Card title={title}><div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4"><KpiTile label="NPS" value={result.score === null ? "—" : fmtNumber(result.score)} hint={`(${result.promoters} − ${result.detractors}) / ${result.valid}`} /><KpiTile label="Ambassadører" value={String(result.promoters)} /><KpiTile label="Passive" value={String(result.passives)} /><KpiTile label="Kritikere" value={String(result.detractors)} /></div><Bars question={question} options={Array.from({ length: 11 }, (_, value) => ({ value: String(value), label: String(value) }))} values={values} filters={filters} hrefFor={hrefFor} /></Card>;
  }
  if (["single_choice", "dropdown", "likert", "multiple_choice"].includes(question.type)) {
    const options = (question.options ?? []).map((option) => ({ value: String(question.type === "likert" ? option.value ?? option.id : option.id), label: lt(option.label, "da") || option.id }));
    return <Card title={title}><Bars question={question} options={options} values={values} filters={filters} hrefFor={hrefFor} /></Card>;
  }
  if (question.type === "consent") return <Card title={title}><Bars question={question} options={[{ value: "true", label: "Ja" }, { value: "false", label: "Nej" }]} values={values} filters={filters} hrefFor={hrefFor} /></Card>;
  const numeric = values.map(Number).filter(Number.isFinite);
  return <Card title={title}><p className="text-sm text-muted">Svar: {values.length}{numeric.length ? ` · gennemsnit ${fmtNumber(numeric.reduce((sum, value) => sum + value, 0) / numeric.length, 2)} (${numeric.reduce((sum, value) => sum + value, 0)} ÷ ${numeric.length})` : ""}</p></Card>;
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

function PrototypeResult({ studyId, studyVersionId, question, values, paths, filters, canRenamePaths, pathLabels }: { studyId: string; studyVersionId: string; question: Question; values: unknown[]; paths: ReturnType<typeof buildPrototypePaths>; filters: ResultFilter[]; canRenamePaths: boolean; pathLabels: Record<string, string> }) {
  const groups = groupCommonPaths(paths);
  const goalFrameId = question.prototype?.goalFrameId;
  const successes = goalFrameId ? paths.filter((path) => path.frames.includes(goalFrameId)).length : 0;
  const clicks = paths.flatMap((path) => path.clicks);
  const misclicks = clicks.filter((click) => click.isMisclick).length;
  const averageElapsedMs = paths.length ? paths.reduce((sum, path) => sum + path.elapsedMs, 0) / paths.length : 0;
  const screenshots = (question.prototype?.frameScreenshots ?? []).flatMap((entry) => entry.screenshot ? [{ frameId: entry.frameId, frameName: entry.frameName, assetId: entry.screenshot.assetId, coordinateScale: entry.coordinateScale }] : []);
  return <Card title={`${lt(question.label, "da") || question.code} · Prototype paths`}>
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
