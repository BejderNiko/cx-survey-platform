import Link from "next/link";
import { notFound } from "next/navigation";
import { assertCan, instrumentDefinition } from "@ok/domain";
import { PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { Builder } from "./builder";

export default async function BuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  assertCan(session.role, "studies.edit");
  const { id } = await params;
  const study = await withUser(session.userId, async (tx) => {
    const [row] = await tx`select id, title, status, draft_definition from studies where id = ${id}`;
    return row ?? null;
  });
  if (!study) notFound();

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Builder · ${study.title}`}
        description="Changes are saved to the draft. Publishing snapshots an immutable version."
        actions={<Link href={`/studies/${id}`} className="text-sm text-accent hover:underline">← Study</Link>}
      />
      <Builder studyId={id} initialDefinition={instrumentDefinition.parse(study.draft_definition)} />
    </div>
  );
}
