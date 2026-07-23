import Link from "next/link";
import { can } from "@ok/domain";
import { Card, EmptyState, LinkButton } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { listRecruitmentPages, listWorkspaces } from "./actions";
import { CreateRecruitmentPageForm } from "./recruitment-create-form";
import { RecruitmentRow } from "./recruitment-row";

export default async function RecruitmentPage({
  searchParams,
}: {
  searchParams: Promise<{ ny?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const canManage = can(session.role, "recruitment.manage");
  const showCreate = canManage && sp.ny !== undefined;

  const [pages, workspaces] = await Promise.all([listRecruitmentPages(), listWorkspaces()]);

  return (
    <div className="space-y-4">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-heading">Rekruttering</h1>
          <p className="mt-1 text-sm text-muted">
            Selvbetjeningssider, der omdanner besøgende til panelister — med screening og egne spørgsmål.
          </p>
        </div>
        {canManage && !showCreate && (
          <LinkButton href="/panel/recruitment?ny=1" variant="primary">+ Opret side</LinkButton>
        )}
      </div>

      {showCreate && (
        <Card
          title="Opret rekrutteringsside"
          actions={<Link href="/panel/recruitment" className="text-xs text-muted hover:text-accent hover:underline">Luk</Link>}
        >
          <CreateRecruitmentPageForm workspaces={workspaces} />
        </Card>
      )}

      <div className="space-y-3">
        {pages.map((p) => (
          <RecruitmentRow
            key={p.id}
            id={p.id}
            internalName={p.internalName}
            isActive={p.isActive}
            publicToken={p.publicToken}
            questionLabels={p.questionLabels}
            submissionCount={p.submissionCount}
            appBaseUrl={env.appBaseUrl}
          />
        ))}
        {pages.length === 0 && (
          <EmptyState
            title="Ingen rekrutteringssider endnu"
            hint="Opret en side for at lade nye panelister tilmelde sig selv, med valgfri screening og skræddersyede spørgsmål."
            action={canManage ? <LinkButton href="/panel/recruitment?ny=1" variant="primary">+ Opret side</LinkButton> : undefined}
          />
        )}
      </div>
    </div>
  );
}
