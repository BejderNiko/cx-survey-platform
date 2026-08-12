import Link from "next/link";
import { notFound } from "next/navigation";
import { allQuestions, assertCan, computeNps, instrumentDefinition, lt, type Question } from "@ok/domain";
import { Card, KpiTile, Table, Td, Th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { buildPrototypePaths, groupCommonPaths, type PrototypeInteractionRow } from "@/lib/prototype-results";
import {
  draftFiltersFromNaturalLanguage,
  filterResponses,
  parseResultFilters,
  RESULT_RESPONSE_LIMIT,
  resultFilterKey,
  resultFilterLabel,
  serializeResultFilters,
  type FilterableResponse,
  type ResultFilter,
} from "@/lib/results-filters";
import { ReportJobs } from "./report-jobs";

type Search = { filters?: string; ask?: string };

export async function ResultsDashboard({ studyId, search }: { studyId: string; search: Search }) {
  const session = await requireSession();
  assertCan(session.role, "responses.view");
  const data = await withUser(session.userId, session.orgId, async (tx) => {
    const [study] = await tx`select id, title, draft_definition from studies where id = ${studyId} and org_id = ${session.orgId}`;
    if (!study) return null;
    const [version] = await tx`
      select id, version_number, definition from study_versions
      where study_id = ${studyId} and org_id = ${session.orgId} order by version_number desc limit 1`;
    const responses = await tx`
      select r.id, r.respondent_key, r.started_at, r.channel, r.panelist_id,
             v.version_number, p.first_name, p.last_name,
             coalesce((select array_agg(t.name order by t.name)
                       from panelist_tags pt join tags t on t.id = pt.tag_id and t.org_id = pt.org_id
                       where pt.panelist_id = r.panelist_id and pt.org_id = r.org_id), '{}') as tags
      from responses r
      join study_versions v on v.id = r.study_version_id and v.org_id = r.org_id
      left join panelists p on p.id = r.panelist_id and p.org_id = r.org_id
      where r.study_id = ${studyId} and r.org_id = ${session.orgId} and r.status = 'completed'
      order by r.started_at desc
      limit ${RESULT_RESPONSE_LIMIT}`;
    const answers = await tx`
      select ra.response_id, ra.question_code, ra.value
      from response_answers ra join responses r on r.id = ra.response_id and r.org_id = ra.org_id
      where r.study_id = ${studyId} and r.org_id = ${session.orgId} and r.status = 'completed'`;
    const interactions = await tx`
      select ie.response_id, ie.question_code, ie.event_type, ie.payload
      from interaction_events ie join responses r on r.id = ie.response_id and r.org_id = ie.org_id
      where r.study_id = ${studyId} and r.org_id = ${session.orgId} and r.status = 'completed'
      order by ie.created_at asc, ie.id asc`;
    return { study, version, responses, answers, interactions };
  });
  if (!data) notFound();

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
      source: row,
    } satisfies FilterableResponse & { source: typeof row };
  });

  const filters = parseResultFilters(search.filters);
  const filtered = filterResponses(responseRows, filters);
  const filteredIds = new Set(filtered.map((response) => response.id));
  const questionValues = (code: string) => filtered.flatMap((response) => response.answers[code] === undefined ? [] : [response.answers[code]]);
  const hrefFor = (nextFilters: ResultFilter[]) => resultHref(studyId, nextFilters);
  const insightDraft = search.ask ? buildInsightDraft(search.ask, definition, questionValues) : null;
  const draft = search.ask && !insightDraft ? draftFiltersFromNaturalLanguage(search.ask, definition) : null;
  const draftFilters = draft?.filters ?? [];
  const combinedDraft = mergeFilters(filters, draftFilters);
  const tagCounts = new Map<string, number>();
  for (const response of responseRows) for (const tag of response.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {data.version ? `Instrumentversion v${data.version.version_number}` : "Kladde"} · alle beregninger bruger samme filtrerede mængde.
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Svar vist" value={String(filtered.length)} hint={`${filtered.length} / ${responseRows.length} gennemførte`} />
        <KpiTile label="Gennemførte i alt" value={String(responseRows.length)} />
        <KpiTile label="Andel vist" value={`${fmtNumber(responseRows.length ? filtered.length / responseRows.length * 100 : 0, 1)} %`} hint={`${filtered.length} ÷ ${responseRows.length || 0}`} />
        <KpiTile label="Aktive filtre" value={String(filters.length)} />
      </div>

      <Card title="Globale filtre">
        <div className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <Link key={resultFilterKey(filter)} href={hrefFor(filters.filter((item) => resultFilterKey(item) !== resultFilterKey(filter)))} className="rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-xs text-accent">
              {resultFilterLabel(filter, definition)} ×
            </Link>
          ))}
          {filters.length === 0 && <span className="text-sm text-muted">Ingen filtre. Klik tragt ved svar, path eller paneltag.</span>}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <form action={`/studies/${studyId}/results`} className="space-y-2">
            {filters.length > 0 && <input type="hidden" name="filters" value={serializeResultFilters(filters)} />}
            <label className="block text-xs font-semibold">Filter- eller indsigtønske i naturligt sprog</label>
            <div className="flex gap-2">
              <input name="ask" defaultValue={search.ask ?? ""} maxLength={500} placeholder="Fx nps = 10, tag = Elbil eller indsigt om nps" className="h-9 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 text-sm" />
              <button className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-white">Lav udkast</button>
            </div>
          </form>
          <div className="text-xs text-muted">
            {insightDraft ? <><p className="font-medium text-heading">{insightDraft.text}</p><p className="mt-1">Grundlag: {insightDraft.basis}</p><p className="mt-1">Proveniens: {insightDraft.provenance}</p><p className="mt-2">Kun preview; ingen filtre, analysejob eller rapport ændres automatisk.</p></> : draft ? <><p>{draft.explanation}</p><p className="mt-1">Proveniens: {draft.provenance}</p>{draftFilters.length > 0 && <Link href={hrefFor(combinedDraft)} className="mt-2 inline-flex rounded-md border border-line px-3 py-1.5 font-medium text-heading">Bekræft og anvend udkast</Link>}</> : <p>Udkast ændrer intet før bekræftelse. Chips kan fjernes bagefter.</p>}
          </div>
        </div>
        {tagCounts.size > 0 && <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">{[...tagCounts].map(([tag, count]) => <Link key={tag} href={hrefFor(mergeFilters(filters, [{ kind: "tag", value: tag }]))} className="rounded-full border border-line px-2.5 py-1 text-xs">⌁ {tag} · {count}</Link>)}</div>}
      </Card>

      {allQuestions(definition).map((question) => question.type === "prototype_test" ? (
        <PrototypeResult key={question.code} question={question} values={questionValues(question.code)} paths={(pathsByQuestion.get(question.code) ?? []).filter((path) => filteredIds.has(path.responseId))} filters={filters} hrefFor={hrefFor} />
      ) : (
        <QuestionResult key={question.code} question={question} values={questionValues(question.code)} filters={filters} hrefFor={hrefFor} />
      ))}

      <ReportJobs studyId={studyId} filters={filters} />

      <Card title={`Individuelle besvarelser (${filtered.length})`}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs text-muted">Samme base som kort og diagrammer: n = {filtered.length}.</p>
          <Link href={`/api/studies/${studyId}/results/export?filters=${encodeURIComponent(serializeResultFilters(filters))}`} className="rounded-md border border-line px-3 py-2 text-sm">{filtered.length} · Eksportér CSV</Link>
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
  const title = <span>{lt(question.label, "da") || question.code} <span className="text-xs font-normal text-muted">n = {values.length}</span></span>;
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
    return <div key={option.value} className={count === 0 ? "opacity-45" : ""}><div className="flex items-center gap-2 text-sm"><span className="w-44 truncate" title={option.label}>{option.label}</span><div className="h-4 flex-1 overflow-hidden rounded bg-background"><div className="h-full rounded bg-accent/80" style={{ width: `${count / max * 100}%` }} /></div><span className="w-12 text-right tabular-nums">{count}</span><Link aria-label={`Filtrér på ${option.label}`} href={hrefFor(mergeFilters(filters, [filter]))} className={active ? "text-accent" : "text-muted"}>▽</Link></div></div>;
  })}</div>;
}

function PrototypeResult({ question, values, paths, filters, hrefFor }: { question: Question; values: unknown[]; paths: ReturnType<typeof buildPrototypePaths>; filters: ResultFilter[]; hrefFor: (filters: ResultFilter[]) => string }) {
  const groups = groupCommonPaths(paths);
  const successes = values.filter((value) => value && typeof value === "object" && (value as Record<string, unknown>).reachedGoal === true).length;
  const clicks = paths.flatMap((path) => path.clicks);
  const misclicks = clicks.filter((click) => click.isMisclick).length;
  return <Card title={`${lt(question.label, "da") || question.code} · Prototype paths`}>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><KpiTile label="Mål nået" value={`${values.length ? fmtNumber(successes / values.length * 100, 1) : 0} %`} hint={`${successes} ÷ ${values.length}`} /><KpiTile label="Deltagere" value={String(values.length)} /><KpiTile label="Klik" value={String(clicks.length)} hint={`${misclicks} fejlklik`} /><KpiTile label="Fælles paths" value={String(groups.length)} /></div>
    <div className="mt-4 space-y-3">{groups.slice(0, 10).map((group, index) => {
      const filter: ResultFilter = { kind: "path", questionCode: question.code, signature: group.signature };
      return <div key={group.signature || "empty"} className="rounded-lg border border-line p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong>Path {index + 1}</strong><Link href={hrefFor(mergeFilters(filters, [filter]))} className="text-xs text-accent">▽ Filtrér</Link></div><p className="mt-1 break-all text-xs text-muted">{group.frames.join(" → ") || "Ingen frame-events"}</p><p className="mt-2 text-xs">{group.participantCount} deltagere · {group.clickCount} klik · {group.misclickCount} fejlklik · gns. {fmtNumber(group.averageElapsedMs / 1000, 1)} s</p></div>;
    })}</div>
    <p className="mt-3 text-xs text-muted">Klikdata er koordinater fra Figma Embed API. Screenshot-overlay vises først, når godkendte screenshots findes i privat storage; ingen Figma-scraping bruges.</p>
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
  const result = [...existing];
  const keys = new Set(existing.map(resultFilterKey));
  for (const filter of additions) if (!keys.has(resultFilterKey(filter))) { result.push(filter); keys.add(resultFilterKey(filter)); }
  return result;
}

function resultHref(studyId: string, filters: ResultFilter[]): string {
  const query = filters.length ? `?filters=${encodeURIComponent(serializeResultFilters(filters))}` : "";
  return `/studies/${studyId}/results${query}`;
}
