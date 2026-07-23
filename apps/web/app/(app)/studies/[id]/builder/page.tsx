import { notFound } from "next/navigation";
import { assertCan, can, instrumentDefinition } from "@ok/domain";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { Builder } from "./builder";
import type { StudyCommentRow } from "../comments-panel";

export default async function BuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  assertCan(session.role, "studies.edit");
  const { id } = await params;
  const data = await withUser(session.userId, session.orgId, async (tx) => {
    const [study] = await tx`select id, title, status, draft_definition from studies where id = ${id}`;
    if (!study) return null;
    const comments = await tx`
      select c.id, c.parent_id, c.question_code, c.body, c.status,
             c.created_at::text, c.resolved_at::text, u.full_name as author,
             resolver.full_name as resolved_by_name
      from comments c
      join users u on u.id = c.author_id
      left join users resolver on resolver.id = c.resolved_by
      where c.study_id = ${id}
      order by c.created_at asc limit 200`;
    return { study, comments };
  });
  if (!data) notFound();

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
