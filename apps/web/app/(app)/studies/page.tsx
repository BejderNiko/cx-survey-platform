import Link from "next/link";
import { AUTHORING_QUESTION_TYPES, allQuestions, can, instrumentDefinition } from "@ok/domain";
import { Card } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { listStudies } from "@/lib/data/studies";
import { CreateStudyForm } from "./create-study-form";
import { StudyOverview } from "./study-overview";

export default async function StudiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; ny?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;

  const data = await withUser(session.userId, session.orgId, async (tx) => {
    const studies = await listStudies(tx, {
      orgId: session.orgId,
      query: sp.q,
      status: sp.status,
    });
    const workspaces = await tx`select id, name from workspaces where org_id = ${session.orgId} order by name`;
    const templates = (await tx`select id, name, category, definition from templates where org_id is null or org_id = ${session.orgId} order by org_id nulls first, name`).filter((template) => {
      const parsed = instrumentDefinition.safeParse(template.definition);
      return parsed.success && allQuestions(parsed.data).every((question) => (AUTHORING_QUESTION_TYPES as readonly string[]).includes(question.type));
    });
    return { studies, workspaces, templates };
  });

  const canCreate = can(session.role, "studies.create");
  const showCreate = canCreate && sp.ny !== undefined;

  return (
    <div className="space-y-5">
      {showCreate && (
        <Card title="Opret studie" actions={<Link href="/studies" className="text-xs text-muted hover:text-accent hover:underline">Luk</Link>}>
          <CreateStudyForm
            workspaces={data.workspaces.map((w) => ({ id: w.id as string, name: w.name as string }))}
            templates={data.templates.map((t) => ({ id: t.id as string, name: t.name as string, category: t.category as string }))}
          />
        </Card>
      )}
      <StudyOverview
        studies={data.studies.map((study) => ({
          id: String(study.id),
          title: String(study.title),
          workspace: String(study.workspace),
          status: String(study.status),
          studyType: String(study.study_type),
          versions: Number(study.versions),
          distributions: Number(study.distributions),
          completed: Number(study.completed),
          updatedAt: String(study.updated_at),
        }))}
        canCreate={canCreate}
      />
    </div>
  );
}
