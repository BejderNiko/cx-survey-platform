import Link from "next/link";
import { can } from "@ok/domain";
import { IconSearch, IconStudy } from "@/components/icons";
import { Badge, Card, EmptyState, LinkButton, ListRow, StatusBadge } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { STUDY_STATUS, STUDY_STATUS_TONE, STUDY_TYPE, label } from "@/lib/labels";
import { CreateStudyForm } from "./create-study-form";

export default async function StudiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; ny?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  const data = await withUser(session.userId, async (tx) => {
    const like = sp.q ? "%" + sp.q + "%" : null;
    const studies = await tx`
      select s.id, s.title, s.status, s.study_type, s.method_tags, s.updated_at,
             w.name as workspace, u.full_name as owner,
             (select count(*) from study_versions v where v.study_id = s.id) as versions,
             (select count(*) from responses r where r.study_id = s.id and r.status = 'completed') as completed,
             (select count(*) from distributions d where d.study_id = s.id) as distributions
      from studies s
      join workspaces w on w.id = s.workspace_id
      join users u on u.id = s.owner_id
      where (${like}::text is null or s.title ilike ${like})
        and (${sp.status ?? null}::text is null or s.status = ${sp.status ?? null}::study_status)
      order by s.updated_at desc`;
    const workspaces = await tx`select id, name from workspaces order by name`;
    const templates = await tx`select id, name, category from templates order by org_id nulls first, name`;
    return { studies, workspaces, templates };
  });

  const canCreate = can(session.role, "studies.create");
  const showCreate = canCreate && sp.ny !== undefined;

  return (
    <div className="space-y-4">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-heading">Studier</h1>
          <p className="mt-1 text-sm text-muted">
            Undersøgelser, udsendelser og besvarelser — samlet ét sted.
          </p>
        </div>
        {canCreate && !showCreate && (
          <LinkButton href="/studies?ny=1" variant="primary">
            + Opret studie
          </LinkButton>
        )}
      </div>

      {showCreate && (
        <Card
          title="Opret studie"
          actions={
            <Link href="/studies" className="text-xs text-muted hover:text-accent hover:underline">
              Luk
            </Link>
          }
        >
          <CreateStudyForm
            workspaces={data.workspaces.map((w) => ({ id: w.id as string, name: w.name as string }))}
            templates={data.templates.map((t) => ({ id: t.id as string, name: t.name as string, category: t.category as string }))}
          />
        </Card>
      )}

      <form className="flex flex-wrap items-center gap-2" action="/studies">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            <IconSearch width={14} height={14} />
          </span>
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Søg i studier"
            aria-label="Søg i studier"
            className="h-9 w-64 rounded-full border border-line bg-surface pl-9 pr-3 text-sm placeholder:text-muted/70 focus:border-accent/60"
          />
        </div>
        <select
          name="status"
          defaultValue={sp.status ?? ""}
          aria-label="Statusfilter"
          className="h-9 rounded-full border border-line bg-surface px-3 text-sm focus:border-accent/60"
        >
          <option value="">Alle statusser</option>
          {Object.keys(STUDY_STATUS).map((s) => (
            <option key={s} value={s}>{STUDY_STATUS[s]}</option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 cursor-pointer rounded-full border border-line bg-surface px-4 text-sm transition-colors hover:border-accent/50 hover:text-accent"
        >
          Filtrér
        </button>
        <span className="ml-auto text-xs text-muted">
          {data.studies.length} {data.studies.length === 1 ? "studie" : "studier"}
        </span>
      </form>

      <div className="space-y-2">
        {data.studies.map((s) => (
          <ListRow key={s.id} href={`/studies/${s.id}`} icon={<IconStudy />}>
            <div className="flex min-w-0 items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate font-medium text-heading">{s.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  {s.workspace} · {label(STUDY_TYPE, s.study_type)}
                  {(s.method_tags as string[]).map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </p>
              </div>
              <div className="hidden shrink-0 items-center gap-6 sm:flex">
                <div className="w-28 text-right">
                  <p className="text-sm font-semibold tabular-nums text-heading">{String(s.completed)}</p>
                  <p className="text-xs text-muted">{Number(s.completed) === 1 ? "besvarelse" : "besvarelser"}</p>
                </div>
                <div className="w-32">
                  <StatusBadge tone={STUDY_STATUS_TONE[s.status] ?? "gray"}>
                    {label(STUDY_STATUS, s.status)}
                  </StatusBadge>
                </div>
                <p className="w-24 text-right text-xs text-muted">{fmtDate(s.updated_at)}</p>
              </div>
            </div>
          </ListRow>
        ))}
        {data.studies.length === 0 && (
          <EmptyState
            title="Ingen studier matcher"
            hint="Justér søgningen eller filtrene — eller opret et nyt studie."
            action={canCreate ? <LinkButton href="/studies?ny=1" variant="primary">+ Opret studie</LinkButton> : undefined}
          />
        )}
      </div>
    </div>
  );
}
