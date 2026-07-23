import { notFound } from "next/navigation";
import { assertCan, instrumentDefinition } from "@ok/domain";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { Builder } from "./builder";

export default async function BuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  assertCan(session.role, "studies.edit");
  const { id } = await params;
  const study = await withUser(session.userId, session.orgId, async (tx) => {
    const [row] = await tx`select id, title, status, draft_definition from studies where id = ${id}`;
    return row ?? null;
  });
  if (!study) notFound();

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Ændringer gemmes i kladden. Publicering fastfryser en uforanderlig version.
      </p>
      <Builder studyId={id} initialDefinition={instrumentDefinition.parse(study.draft_definition)} />
    </div>
  );
}
