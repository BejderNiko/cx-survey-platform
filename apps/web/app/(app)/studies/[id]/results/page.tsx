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
import { Badge, Card, KpiTile, PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { fmtNumber } from "@/lib/format";

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;

  const data = await withUser(session.userId, async (tx) => {
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
    return { study, version, answers, counts, clicks };
  });
  if (!data) notFound();

  const def = instrumentDefinition.parse(data.version?.definition ?? data.study.draft_definition);
  const locale = (session.locale === "da" ? "da" : "en") as Locale;
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
      <PageHeader
        title={`Results · ${data.study.title}`}
        description={
          data.version
            ? `Instrument version v${data.version.version_number} · completed responses only`
            : "Not published yet"
        }
        actions={<Link href={`/studies/${id}`} className="text-sm text-accent hover:underline">← Study</Link>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Completed" value={String(completed)} />
        <KpiTile label="Partial (drop-off)" value={String(data.counts.partial)} hint={`${dropOff}% of all started`} />
        <KpiTile label="Disqualified" value={String(data.counts.disqualified)} />
        <KpiTile label="All started" value={String(total)} />
      </div>

      {questions.map((q) => (
        <QuestionResult
          key={q.code}
          question={q}
          locale={locale}
          values={byCode.get(q.code) ?? []}
          clicks={clicksByCode.get(q.code) ?? []}
          uiLocale={session.locale}
        />
      ))}
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
  question, locale, values, clicks, uiLocale,
}: {
  question: Question;
  locale: Locale;
  values: unknown[];
  clicks: Record<string, number>[];
  uiLocale: string;
}) {
  const title = (
    <span className="flex items-center gap-2">
      <Badge>{question.type}</Badge>
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
            <KpiTile label="NPS" value={r.score === null ? "—" : fmtNumber(r.score, uiLocale)}
              hint={`(${r.promoters} − ${r.detractors}) / ${r.valid} valid · ${r.excluded} excluded`} />
            <KpiTile label="Promoters (9-10)" value={`${r.promoters}`} tone="good" />
            <KpiTile label="Passives (7-8)" value={`${r.passives}`} />
            <KpiTile label="Detractors (0-6)" value={`${r.detractors}`} tone="bad" />
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
            <KpiTile label="CSAT (% 4-5)" value={r.score === null ? "—" : `${fmtNumber(r.score, uiLocale)}%`} hint={`${r.satisfied} of ${r.valid} valid`} />
            <KpiTile label="Mean" value={r.mean === null ? "—" : fmtNumber(r.mean, uiLocale, 2)} />
            <KpiTile label="Excluded" value={String(r.excluded)} />
          </div>
        </Card>
      );
    }
    case "ces": {
      const r = computeCes(values);
      return (
        <Card title={title}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <KpiTile label="Mean effort (1-7)" value={r.mean === null ? "—" : fmtNumber(r.mean, uiLocale, 2)} />
            <KpiTile label="% low effort (5-7)" value={r.pctLowEffort === null ? "—" : `${fmtNumber(r.pctLowEffort, uiLocale)}%`} />
            <KpiTile label="Valid / excluded" value={`${r.valid} / ${r.excluded}`} />
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
            <KpiTile label="Mean" value={mean === null ? "—" : fmtNumber(mean, uiLocale, 2)} />
            <KpiTile label="Median" value={median === null ? "—" : fmtNumber(median, uiLocale, 2)} />
            <KpiTile label="Answers" value={String(nums.length)} />
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
            <Bar label={locale === "da" ? "Ja" : "Yes"} count={yes} max={max} />
            <Bar label={locale === "da" ? "Nej" : "No"} count={no} max={max} />
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
                <Bar key={row.id} label={lt(row.label, locale)} count={Math.round(mean * 100) / 100} max={scaleMax} suffix=" avg" />
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
            <KpiTile label="Clicks" value={String(clicks.length)} />
            <KpiTile label="Median time to click" value={medianMs === null ? "—" : `${fmtNumber(medianMs / 1000, uiLocale, 1)} s`} />
          </div>
          {question.imageUrl && (
            <div className="relative inline-block max-w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={question.imageUrl} alt="Stimulus with click map" className="max-w-full rounded-md border border-line" />
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
              <li key={i} className="rounded-md border border-line bg-background px-3 py-1.5 text-sm">{t}</li>
            ))}
            {texts.length === 0 && <li className="text-sm text-muted">No text answers.</li>}
          </ul>
          {values.length > 20 && <p className="mt-2 text-xs text-muted">Showing 20 of {values.length}.</p>}
        </Card>
      );
    }
  }
}
