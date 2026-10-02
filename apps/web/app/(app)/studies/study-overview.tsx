"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { IconSearch, IconStudy } from "@/components/icons";
import { Badge, Button, cn, StatusBadge } from "@/components/ui";

type StudyLink = { id: string };

type OverviewStudy = {
  title: string;
  area: string;
  status: string;
  statusTone: string;
  type: string;
  questions: number;
  distributions: number;
  responses: number;
  updated: string;
  publicLink?: string;
};

const AREAS = [
  { name: "Alle studier", count: 12 },
  { name: "Energi & Bolig", count: 5 },
  { name: "Mobilitet", count: 4 },
  { name: "Erhverv", count: 3 },
] as const;

const STUDIES: OverviewStudy[] = [
  {
    title: "Kundeoplevelse efter flytning",
    area: "Energi & Bolig",
    status: "Indsamler",
    statusTone: "green",
    type: "Spørgeskema",
    questions: 12,
    distributions: 2,
    responses: 486,
    publicLink: "Offentligt link aktiv",
    updated: "14. apr. 2026",
  },
  {
    title: "Varmepumpe: behov og barrierer",
    area: "Energi & Bolig",
    status: "Planlagt",
    statusTone: "amber",
    type: "Spørgeskema",
    questions: 16,
    distributions: 1,
    responses: 0,
    updated: "18. mar. 2026",
  },
  {
    title: "Oplevelsen af energirådgivning",
    area: "Energi & Bolig",
    status: "Til gennemsyn",
    statusTone: "blue",
    type: "Interview",
    questions: 8,
    distributions: 0,
    responses: 0,
    updated: "11. mar. 2026",
  },
  {
    title: "Boligforbedringer og energiforbrug",
    area: "Energi & Bolig",
    status: "Kladde",
    statusTone: "gray",
    type: "Spørgeskema",
    questions: 10,
    distributions: 0,
    responses: 0,
    updated: "4. mar. 2026",
  },
];

export function StudyOverview({ studyLinks, canCreate }: { studyLinks: StudyLink[]; canCreate: boolean }) {
  const [area, setArea] = useState("Energi & Bolig");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Alle statusser");
  const [type, setType] = useState("Alle studietyper");
  const [sort, setSort] = useState("Senest opdateret");

  const visibleStudies = useMemo(() => {
    const filtered = STUDIES.filter((study) => {
      const matchesArea = area === "Alle studier" || study.area === area;
      const matchesQuery = study.title.toLocaleLowerCase("da-DK").includes(query.trim().toLocaleLowerCase("da-DK"));
      const matchesStatus = status === "Alle statusser" || study.status === status;
      const matchesType = type === "Alle studietyper" || study.type === type;
      return matchesArea && matchesQuery && matchesStatus && matchesType;
    });
    return sort === "Navn A–Å" ? [...filtered].sort((a, b) => a.title.localeCompare(b.title, "da")) : filtered;
  }, [area, query, sort, status, type]);

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Studier</p>
          <h1 className="mt-2 font-display text-[2.65rem] leading-none tracking-[-0.035em] text-heading">Studier</h1>
          <p className="mt-3 text-[15px] text-muted">Undersøgelser, udsendelser og resultater — samlet ét sted.</p>
        </div>
        {canCreate && <Link href="/studies?ny=1" className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-white shadow-pop transition hover:bg-accent-hover"><span className="text-lg leading-none">+</span> Opret studie</Link>}
      </div>

      <section aria-labelledby="area-heading" className="rounded-2xl border border-line bg-surface-raised p-5 shadow-card md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="area-heading" className="font-display text-xl text-heading">Område</h2>
            <p className="mt-1 text-sm text-muted">Vælg forretningsområde for at se relevante studier.</p>
          </div>
          <span className="text-xs text-muted">Alle tal er illustrative</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {AREAS.map((item) => {
            const selected = area === item.name;
            return (
              <button key={item.name} type="button" aria-pressed={selected} onClick={() => setArea(item.name)} className={cn("group flex min-h-[92px] items-center justify-between rounded-xl border px-4 py-4 text-left transition-all duration-150", selected ? "border-accent bg-accent-wash text-accent shadow-[0_0_0_1px_var(--accent)]" : "border-line bg-surface hover:-translate-y-0.5 hover:border-accent/35 hover:shadow-card")}>
                <span><span className={cn("block text-sm font-semibold", selected ? "text-accent" : "text-heading")}>{item.name}</span><span className="mt-1 block text-xs text-muted">{item.count} studier</span></span>
                <span className={cn("grid h-7 w-7 place-items-center rounded-full text-xs font-semibold", selected ? "bg-accent text-white" : "bg-background text-muted")}>{item.count}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-label="Studiefiltre" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="relative min-w-[220px] flex-1 sm:flex-none"><span className="sr-only">Søg i studier</span><IconSearch width={15} height={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Søg i studier" className="h-10 w-full rounded-full border border-line bg-surface px-4 pl-9 text-sm placeholder:text-muted/70 transition focus:border-accent/60" /></label>
          <select aria-label="Statusfilter" value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-full border border-line bg-surface px-4 text-sm text-foreground transition focus:border-accent/60"><option>Alle statusser</option><option>Indsamler</option><option>Planlagt</option><option>Til gennemsyn</option><option>Kladde</option></select>
          <select aria-label="Studietypefilter" value={type} onChange={(event) => setType(event.target.value)} className="h-10 rounded-full border border-line bg-surface px-4 text-sm text-foreground transition focus:border-accent/60"><option>Alle studietyper</option><option>Spørgeskema</option><option>Interview</option></select>
          <select aria-label="Sortering" value={sort} onChange={(event) => setSort(event.target.value)} className="h-10 rounded-full border border-line bg-surface px-4 text-sm text-foreground transition focus:border-accent/60"><option>Senest opdateret</option><option>Navn A–Å</option></select>
          <span className="ml-auto whitespace-nowrap text-sm font-medium text-heading">5 studier</span>
        </div>
      </section>

      <div className="space-y-3">
        {visibleStudies.map((study, index) => {
          const targetId = studyLinks[index]?.id;
          const href = targetId ? `/studies/${targetId}` : "/studies";
          return (
            <article key={study.title} className="group rounded-2xl border border-line bg-surface-raised p-5 shadow-card transition-all duration-150 hover:border-accent/30 hover:shadow-pop md:p-6">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-[1.35rem] leading-tight text-heading">{study.title}</h2><Badge tone="accent">{study.area}</Badge><StatusBadge tone={study.statusTone}>{study.status}</StatusBadge></div>
                  <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted"><span className="inline-flex items-center gap-2"><IconStudy width={16} height={16} />{study.type}</span><span><strong className="font-semibold text-heading">{study.questions}</strong> spørgsmål</span><span><strong className="font-semibold text-heading">{study.distributions}</strong> {study.distributions === 1 ? "udsendelse" : "udsendelser"}</span><span><strong className="font-semibold text-heading">{study.responses}</strong> {study.responses === 1 ? "besvarelse" : "besvarelser"}</span>{study.publicLink && <span className="inline-flex items-center gap-1.5 font-medium text-success"><span className="h-1.5 w-1.5 rounded-full bg-success" />{study.publicLink}</span>}</div>
                </div>
                <div className="flex shrink-0 items-center justify-between gap-4 border-t border-line/70 pt-4 xl:border-t-0 xl:pt-0"><time className="text-xs text-muted">Opdateret {study.updated}</time><div className="flex items-center gap-2"><Link href={href} className="inline-flex h-9 items-center rounded-full bg-accent px-4 text-sm font-semibold text-white transition hover:bg-accent-hover">Åbn studie</Link><Button type="button" variant="ghost" size="md" aria-label={`Flere handlinger for ${study.title}`} className="h-9 w-9 rounded-full px-0 text-lg text-muted">···</Button></div></div>
              </div>
            </article>
          );
        })}
        {visibleStudies.length === 0 && <div className="rounded-2xl border border-dashed border-line-strong bg-surface-raised px-6 py-12 text-center"><p className="font-display text-lg text-heading">Ingen studier matcher filtrene</p><p className="mt-1 text-sm text-muted">Prøv et andet søgeord eller vælg Alle statusser.</p></div>}
      </div>
    </div>
  );
}
