import Link from "next/link";
import { notFound } from "next/navigation";
import {
  allQuestions,
  computeCes,
  computeCsat,
  computeNps,
  instrumentDefinition,
  lt,
  type Locale,
  type Question,
} from "@ok/domain";
import { Badge, Card, KpiTile, Table, Td, Th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { CHANNEL, QUESTION_TYPE, RESPONSE_STATUS, label } from "@/lib/labels";

/** Resultat-fanen: aggregerede resultater pr. spørgsmål + individuelle besvarelser. */
export default async function ResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const sp = await searchParams;

  const data = await withUser(session.userId, session.orgId, async (tx) => {
    const [study] = await tx`select id, title, status, draft_definition from studies where id = ${id}`;
    if (!study) return null;
    const [version] = await tx`
      select id, version_number, definition from study_versions
      where study_id = ${id} order by version_number desc limit 1`;
    const answers = await tx`
      select ra.question_code, ra.value
      from response_answers ra join responses r on r.id = ra.response_id
      where r.study_id = ${id} and r.status = 'completed'`;
    const [counts] = await tx`
      select count(*) filter (where status = 'completed') as completed,
             count(*) filter (where status = 'started') as partial,
             count(*) filter (where status = 'disqualified') as disqualified,
             count(*) as total
      from responses where study_id = ${id}`;
    const clicks = await tx`
      select ie.question_code, ie.payload
      from interaction_events ie join responses r on r.id = ie.response_id
      where r.study_id = ${id} and ie.event_type = 'first_click'`;
    const rows = await tx`
      select r.id, r.respondent_key, r.status, r.channel, r.started_at,
             v.version_number, p.first_name, p.last_name, p.id as panelist_id,
             (select value from response_answers ra where ra.response_id = r.id and ra.question_type = 'nps' limit 1) as nps
      from responses r
      join study_versions v on v.id = r.study_version_id
      left join panelists p on p.id = r.panelist_id
      where r.study_id = ${id}
        and (${sp.status ?? null}::text is null or r.status = ${sp.status ?? null}::response_status)
      order by r.started_at desc
      limit 100`;
    return { study, version, answers, counts, clicks, rows };
  });
  if (!data) notFound();

  const def = instrumentDefinition.parse(data.version?.definition ?? data.study.draft_definition);
  const locale: Locale = "da";
  const questions = allQuestions(def);

  const byCode = new Map<string, unknown[]>();
  for (const a of data.answers) {
    const arr = byCode.get(a.question_code) ?? [];
    arr.push(a.value);
    byCode.set(a.question_code, arr);
  }
  const clicksByCode = new Map<string, Record<string, number>[]>();
  for (const c of data.clicks) {
    const arr = clicksByCode.get(c.question_code) ?? [];
    arr.push(c.payload as Record<string, number>);
    clicksByCode.set(c.question_code, arr);
  }

  const completed = Number(data.counts.completed);
  const total = Number(data.counts.total);
  const dropOff = total > 0 ? Math.round((Number(data.counts.partial) / total) * 100) : 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {data.version
          ? `Instrumentversion v${data.version.version_number} · aggregater beregnes kun på gennemførte besvarelser`
          : "Ikke publiceret endnu"}
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Gennemførte" value={String(completed)} />
        <KpiTile label="Påbegyndte (frafald)" value={String(data.counts.partial)} hint={`${dropOff} % af alle startede`} />
        <KpiTile label="Frasorterede" value={String(data.counts.disqualified)} />
        <KpiTile label="Alle startede" value={String(total)} />
      </div>

      {questions.map((q) => (
        <QuestionResult
          key={q.code}
          question={q}
          locale={locale}
          values={byCode.get(q.code) ?? []}
          clicks={clicksByCode.get(q.code) ?? []}
        />
      ))}

      <Card title={`Individuelle besvarelser (${data.rows.length}${data.rows.length === 100 ? "+" : ""})`}>
        <form className="mb-3 flex flex-wrap gap-2" action={`/studies/${id}/results`}>
          <select
            name="status"
            defaultValue={sp.status ?? ""}
            aria-label="Status"
            className="h-9 rounded-full border border-line bg-surface px-3 text-sm"
          >
            <option value="">Alle statusser</option>
            {Object.keys(RESPONSE_STATUS).map((s) => (
              <option key={s} value={s}>{RESPONSE_STATUS[s]}</option>
            ))}
          </select>
          <button
            type="submit"
            className="h-9 cursor-pointer rounded-full border border-line bg-surface px-4 text-sm transition-colors hover:border-accent/50 hover:text-accent"
          >
            Filtrér
          </button>
        </form>
        <Table>
          <thead>
            <tr>
              <Th>Respondent</Th><Th>Ver.</Th><Th>Status</Th>
              <Th>NPS</Th><Th>Kanal</Th><Th>Påbegyndt</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => {
              const nps = r.nps === null || r.nps === undefined ? null : Number(r.nps);
              return (
                <tr key={r.id}>
                  <Td>
                    {r.panelist_id ? (
                      <Link href={`/panel/${r.panelist_id}`} className="text-accent hover:underline">
                        {[r.first_name, r.last_name].filter(Boolean).join(" ") || "(anonymiseret)"}
                      </Link>
                    ) : (
                      <span className="font-mono text-xs text-muted">{r.respondent_key}</span>
                    )}
                  </Td>
                  <Td>v{r.version_number}</Td>
                  <Td>
                    <Badge tone={r.status === "completed" ? "green" : r.status === "disqualified" ? "gray" : "amber"}>
                      {label(RESPONSE_STATUS, r.status)}
                    </Badge>
                  </Td>
                  <Td>
                    {nps === null ? "—" : (
                      <Badge tone={nps >= 9 ? "green" : nps >= 7 ? "amber" : "red"}>{nps}</Badge>
                    )}
                  </Td>
                  <Td>{label(CHANNEL, r.channel)}</Td>
                  <Td className="whitespace-nowrap text-muted">{fmtDateTime(r.started_at)}</Td>
                </tr>
              );
            })}
            {data.rows.length === 0 && <tr><Td colSpan={6} className="text-muted">Ingen besvarelser matcher.</Td></tr>}
          </tbody>
        </Table>
        {data.rows.length === 100 && <p className="mt-2 text-xs text-muted">Viser de seneste 100.</p>}
      </Card>
    </div>
  );
}

function Bar({ label, count, max, suffix }: { label: string; count: number; max: number; suffix?: string }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-44 shrink-0 truncate" title={label}>{label}</span>
      <div className="h-4 flex-1 overflow-hidden rounded bg-background">
        <div className="h-full rounded bg-accent/80" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-16 text-right tabular-nums text-muted">{count}{suffix ?? ""}</span>
    </div>
  );
}

function QuestionResult({
  question, locale, values, clicks,
}: {
  question: Question;
  locale: Locale;
  values: unknown[];
  clicks: Record<string, number>[];
}) {
  const title = (
    <span className="flex items-center gap-2">
      <Badge>{label(QUESTION_TYPE, question.type)}</Badge>
      {lt(question.label, locale) || question.code}
      <span className="text-xs font-normal text-muted">n = {values.length}</span>
    </span>
  );

  switch (question.type) {
    case "nps": {
      const r = computeNps(values);
      const hist = new Map<number, number>();
      for (let i = 0; i <= 10; i++) hist.set(i, 0);
      for (const v of values) {
        const n = Number(v);
        if (Number.isInteger(n) && n >= 0 && n <= 10) hist.set(n, (hist.get(n) ?? 0) + 1);
      }
      const max = Math.max(...hist.values(), 1);
      return (
        <Card title={title}>
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiTile label="NPS" value={r.score === null ? "—" : fmtNumber(r.score)}
              hint={`(${r.promoters} − ${r.detractors}) / ${r.valid} gyldige · ${r.excluded} udeladt`} />
            <KpiTile label="Ambassadører (9-10)" value={`${r.promoters}`} tone="good" />
            <KpiTile label="Passive (7-8)" value={`${r.passives}`} />
            <KpiTile label="Kritikere (0-6)" value={`${r.detractors}`} tone="bad" />
          </div>
          <div className="space-y-1">
            {[...hist.entries()].map(([score, count]) => (
              <Bar key={score} label={String(score)} count={count} max={max} />
            ))}
          </div>
        </Card>
      );
    }
    case "csat": {
      const r = computeCsat(values);
      return (
        <Card title={title}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <KpiTile label="CSAT (% 4-5)" value={r.score === null ? "—" : `${fmtNumber(r.score)} %`} hint={`${r.satisfied} af ${r.valid} gyldige`} />
            <KpiTile label="Gennemsnit" value={r.mean === null ? "—" : fmtNumber(r.mean, 2)} />
            <KpiTile label="Udeladt" value={String(r.excluded)} />
          </div>
        </Card>
      );
    }
    case "ces": {
      const r = computeCes(values);
      return (
        <Card title={title}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <KpiTile label="Gennemsnitlig indsats (1-7)" value={r.mean === null ? "—" : fmtNumber(r.mean, 2)} />
            <KpiTile label="% lav indsats (5-7)" value={r.pctLowEffort === null ? "—" : `${fmtNumber(r.pctLowEffort)} %`} />
            <KpiTile label="Gyldige / udeladt" value={`${r.valid} / ${r.excluded}`} />
          </div>
        </Card>
      );
    }
    case "single_choice":
    case "dropdown":
    case "likert": {
      const counts = new Map<string, number>();
      for (const v of values) counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
      const max = Math.max(...counts.values(), 1);
      return (
        <Card title={title}>
          <div className="space-y-1">
            {(question.options ?? []).map((opt) => {
              const key = String(question.type === "likert" ? (opt.value ?? opt.id) : opt.id);
              return <Bar key={opt.id} label={lt(opt.label, locale)} count={counts.get(key) ?? 0} max={max} />;
            })}
          </div>
        </Card>
      );
    }
    case "multiple_choice": {
      const counts = new Map<string, number>();
      for (const v of values) {
        if (Array.isArray(v)) for (const item of v) counts.set(String(item), (counts.get(String(item)) ?? 0) + 1);
      }
      const max = Math.max(...counts.values(), 1);
      return (
        <Card title={title}>
          <div className="space-y-1">
            {(question.options ?? []).map((opt) => (
              <Bar key={opt.id} label={lt(opt.label, locale)} count={counts.get(opt.id) ?? 0} max={max} />
            ))}
          </div>
        </Card>
      );
    }
    case "rating":
    case "number": {
      const nums = values.map(Number).filter((n) => Number.isFinite(n));
      const mean = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      const sorted = [...nums].sort((a, b) => a - b);
      const median = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
      return (
        <Card title={title}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <KpiTile label="Gennemsnit" value={mean === null ? "—" : fmtNumber(mean, 2)} />
            <KpiTile label="Median" value={median === null ? "—" : fmtNumber(median, 2)} />
            <KpiTile label="Svar" value={String(nums.length)} />
          </div>
        </Card>
      );
    }
    case "consent": {
      const yes = values.filter((v) => v === true || v === "true").length;
      const no = values.length - yes;
      const max = Math.max(yes, no, 1);
      return (
        <Card title={title}>
          <div className="space-y-1">
            <Bar label="Ja" count={yes} max={max} />
            <Bar label="Nej" count={no} max={max} />
          </div>
        </Card>
      );
    }
    case "matrix": {
      const rows = question.rows ?? [];
      return (
        <Card title={title}>
          <div className="space-y-1">
            {rows.map((row) => {
              const nums = values
                .map((v) => (v && typeof v === "object" ? Number((v as Record<string, unknown>)[row.id]) : NaN))
                .filter((n) => Number.isFinite(n));
              const mean = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
              const scaleMax = Math.max(...(question.options ?? []).map((o) => Number(o.value ?? 0)), 5);
              return (
                <Bar key={row.id} label={lt(row.label, locale)} count={Math.round(mean * 100) / 100} max={scaleMax} suffix=" gns." />
              );
            })}
          </div>
        </Card>
      );
    }
    case "preference_test": {
      const counts = new Map<string, number>();
      for (const value of values) {
        if (value && typeof value === "object") {
          const selectedId = String((value as Record<string, unknown>).selectedId ?? "");
          if (selectedId) counts.set(selectedId, (counts.get(selectedId) ?? 0) + 1);
        }
      }
      const valid = [...counts.values()].reduce((sum, count) => sum + count, 0);
      const max = Math.max(...counts.values(), 1);
      return (
        <Card title={title}>
          <div className="grid gap-4 sm:grid-cols-2">
            {(question.stimuli ?? []).map((stimulus) => {
              const count = counts.get(stimulus.id) ?? 0;
              const share = valid > 0 ? Math.round((count / valid) * 1000) / 10 : 0;
              return (
                <div key={stimulus.id} className="min-w-0 rounded-lg border border-line p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/stimuli/${stimulus.assetId}`} alt={stimulus.altText} className="h-40 w-full max-w-full object-contain" />
                  <div className="mt-2">
                    <Bar label={stimulus.altText} count={count} max={max} suffix={` (${fmtNumber(share, 1)} %)`} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      );
    }
    case "first_click": {
      const times = clicks.map((c) => Number(c.elapsedMs)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
      const medianMs = times.length ? times[Math.floor((times.length - 1) / 2)] : null;
      return (
        <Card title={title}>
          <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <KpiTile label="Klik" value={String(clicks.length)} />
            <KpiTile label="Mediantid til klik" value={medianMs === null ? "—" : `${fmtNumber(medianMs / 1000, 1)} s`} />
          </div>
          {(question.stimulus || question.imageUrl) && (
            <div className="relative inline-block max-w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={question.stimulus ? `/api/stimuli/${question.stimulus.assetId}` : question.imageUrl}
                alt={question.stimulus?.altText ?? "Stimulus med klikkort"}
                className="max-w-full rounded-lg border border-line"
              />
              {clicks.map((c, i) => {
                const left = (Number(c.x) / Number(c.naturalWidth || 1)) * 100;
                const top = (Number(c.y) / Number(c.naturalHeight || 1)) * 100;
                return (
                  <span
                    key={i}
                    aria-hidden
                    className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-danger/70"
                    style={{ left: `${left}%`, top: `${top}%` }}
                  />
                );
              })}
            </div>
          )}
        </Card>
      );
    }
    default: {
      const texts = values.map(String).filter((s) => s.trim() !== "").slice(0, 20);
      return (
        <Card title={title}>
          <ul className="space-y-1.5">
            {texts.map((t, i) => (
              <li key={i} className="rounded-lg border border-line bg-surface-raised px-3 py-1.5 text-sm">{t}</li>
            ))}
            {texts.length === 0 && <li className="text-sm text-muted">Ingen tekstsvar.</li>}
          </ul>
          {values.length > 20 && <p className="mt-2 text-xs text-muted">Viser 20 af {values.length}.</p>}
        </Card>
      );
    }
  }
}
