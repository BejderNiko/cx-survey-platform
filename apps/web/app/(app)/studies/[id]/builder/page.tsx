import { notFound } from "next/navigation";
import { assertCan, can, instrumentDefinition } from "@ok/domain";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { Builder } from "./builder";
import { Builder as ModernBuilder } from "./modern-builder";
import type { StudyCommentRow } from "../comments-panel";

export default async function BuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const session = await requireSession();
  assertCan(session.role, "studies.edit");
  const { id } = await params;
  const data = await withUser(session.userId, session.orgId, async (tx) => {
    const [study] = await tx`select id, title, status, draft_definition from studies where id = ${id} and org_id = ${session.orgId}`;
    if (!study) return null;
    const comments = await tx`
      select c.id, c.parent_id, c.question_code, c.body, c.status,
             c.created_at::text, c.resolved_at::text, coalesce(u.full_name, 'Tidligere bruger') as author,
             resolver.full_name as resolved_by_name
      from comments c
      left join users u on u.id = c.author_id
      left join users resolver on resolver.id = c.resolved_by
      where c.study_id = ${id} and c.org_id = ${session.orgId}
      order by c.created_at asc limit 200`;
    return { study, comments };
  });
  if (!data) notFound();

  const { mode } = await searchParams;

  if (mode !== "legacy") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Ændringer gemmes i kladden. Publicering fastfryser en uforanderlig version.
        </p>
        <ModernBuilder
          studyId={id}
          initialTitle={data.study.title as string}
          initialDefinition={instrumentDefinition.parse(data.study.draft_definition)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Ændringer gemmes i kladden. Publicering fastfryser en uforanderlig version.
      </p>
      <Builder
        studyId={id}
        initialDefinition={instrumentDefinition.parse(data.study.draft_definition)}
        initialComments={data.comments as unknown as StudyCommentRow[]}
        canResolveComments={can(session.role, "comments.resolve")}
      />
    </div>
  );
}
