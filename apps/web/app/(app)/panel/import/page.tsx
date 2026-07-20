import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { assertCan } from "@ok/domain";
import { withUser } from "@/lib/db";
import { ImportWizard } from "./import-wizard";
import { listBatches } from "./actions";

export default async function ImportPage() {
  const session = await requireSession();
  assertCan(session.role, "panel.import");
  const batches = await listBatches();
  const attributeKeys = await withUser(session.userId, async (tx) => {
    const rows = await tx`select key, label from custom_fields order by key`;
    return rows.map((r) => ({ key: r.key as string, label: r.label as string }));
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Import panelists"
        description="CSV or XLSX. Preview, map columns, validate, dry-run, then commit. No file is imported without a dry run."
        actions={<Link href="/panel" className="text-sm text-accent hover:underline">← Panel</Link>}
      />
      <ImportWizard attributeFields={attributeKeys} history={batches} locale={session.locale} />
    </div>
  );
}
