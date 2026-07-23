import Link from "next/link";
import { notFound } from "next/navigation";
import { assertCan } from "@ok/domain";
import { requireSession } from "@/lib/auth";
import { getRecruitmentPageForEdit } from "../actions";
import { RecruitmentEditor } from "./recruitment-editor";

export default async function RecruitmentPageEditor({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  assertCan(session.role, "recruitment.manage");
  const { id } = await params;
  const data = await getRecruitmentPageForEdit(id);
  if (!data) notFound();

  return (
    <div className="space-y-4">
      <div>
        <Link href="/panel/recruitment" className="text-xs text-muted hover:text-accent hover:underline">
          ← Rekruttering
        </Link>
        <h1 className="mt-1 font-display text-2xl tracking-tight text-heading">{data.page.internalName}</h1>
      </div>
      <RecruitmentEditor page={data.page} questions={data.questions} availableFields={data.availableFields} />
    </div>
  );
}
