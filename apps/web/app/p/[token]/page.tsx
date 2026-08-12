import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { instrumentDefinition } from "@ok/domain";
import { SurveyRenderer } from "@/components/survey/renderer";
import { adminSql } from "@/lib/db";
import { draftDefinitionHash, verifyDraftPreviewToken } from "@/lib/preview-token";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Forhåndsvisning af undersøgelse",
  robots: { index: false, follow: false },
};

export default async function DraftPreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const capability = await verifyDraftPreviewToken(token);
  if (!capability) notFound();

  const [study] = await adminSql`
    select id, title, draft_definition
    from studies
    where id = ${capability.studyId} and org_id = ${capability.orgId}`;
  if (!study || draftDefinitionHash(study.draft_definition) !== capability.draftHash) notFound();

  const parsed = instrumentDefinition.safeParse(study.draft_definition);
  if (!parsed.success) notFound();

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-8">
      <div className="mx-auto mb-4 max-w-6xl rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Anonym forhåndsvisning. Link udløber efter 24 timer. Svar og prototype-events gemmes ikke.
      </div>
      <SurveyRenderer
        definition={parsed.data}
        mode="preview"
        studyTitle={String(study.title)}
        assetToken={token}
      />
    </main>
  );
}
