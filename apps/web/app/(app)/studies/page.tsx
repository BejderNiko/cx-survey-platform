import Link from "next/link";
import { can } from "@ok/domain";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { CreateStudyForm } from "./create-study-form";

const STATUS_TONE: Record<string, string> = {
  draft: "gray", review: "blue", scheduled: "blue", live: "green",
  paused: "amber", closed: "amber", archived: "gray",
};

export default async function StudiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  const data = await withUser(session.userId, async (tx) => {
    const like = sp.q ? "%" + sp.q + "%" : null;
    const studies = await tx`
      select s.id, s.title, s.status, s.study_type, s.method_tags, s.updated_at,
             w.name as workspace, u.full_name as owner,
             (select count(*) from study_versions v where v.study_id = s.id) as versions,
             (select count(*) from responses r where r.study_id = s.id and r.status = 'completed') as completed
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Studies"
        description="Surveys and research studies with versioned instruments."
      />

      {canCreate && (
        <Card title="Create study">
          <CreateStudyForm
            workspaces={data.workspaces.map((w) => ({ id: w.id as string, name: w.name as string }))}
            templates={data.templates.map((t) => ({ id: t.id as string, name: t.name as string, category: t.category as string }))}
          />
        </Card>
      )}

      <Card title={`All studies (${data.studies.length})`}>
        <form className="mb-3 flex gap-2" action="/studies">
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search studies"
            aria-label="Search studies"
            className="h-8.5 w-64 rounded-md border border-line bg-surface px-2.5 text-sm"
          />
          <select name="status" defaultValue={sp.status ?? ""} aria-label="Status filter"
            className="h-8.5 rounded-md border border-line bg-surface px-2 text-sm">
            <option value="">All statuses</option>
            {Object.keys(STATUS_TONE).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="submit" className="h-8.5 rounded-md border border-line bg-surface px-3 text-sm hover:bg-background cursor-pointer">
            Filter
          </button>
        </form>
        <Table>
          <thead>
            <tr>
              <Th>Study</Th><Th>Workspace</Th><Th>Type</Th><Th>Status</Th>
              <Th>Owner</Th><Th className="text-right">Versions</Th>
              <Th className="text-right">Completed</Th><Th>Updated</Th>
            </tr>
          </thead>
          <tbody>
            {data.studies.map((s) => (
              <tr key={s.id}>
                <Td>
                  <Link href={`/studies/${s.id}`} className="font-medium text-accent hover:underline">{s.title}</Link>
                  <span className="ml-2 space-x-1">
                    {(s.method_tags as string[]).map((t) => <Badge key={t}>{t}</Badge>)}
                  </span>
                </Td>
                <Td>{s.workspace}</Td>
                <Td>{s.study_type}</Td>
                <Td><Badge tone={STATUS_TONE[s.status] ?? "gray"}>{s.status}</Badge></Td>
                <Td>{s.owner}</Td>
                <Td className="text-right tabular-nums">{String(s.versions)}</Td>
                <Td className="text-right tabular-nums">{String(s.completed)}</Td>
                <Td className="whitespace-nowrap text-muted">{fmtDate(s.updated_at, session.locale)}</Td>
              </tr>
            ))}
            {data.studies.length === 0 && (
              <tr><Td colSpan={8} className="text-muted">No studies match.</Td></tr>
            )}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
