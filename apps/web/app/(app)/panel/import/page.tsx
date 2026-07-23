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
  const attributeKeys = await withUser(session.userId, session.orgId, async (tx) => {
    const rows = await tx`select key, label from custom_fields order by key`;
    return rows.map((r) => ({ key: r.key as string, label: r.label as string }));
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Importér panelister"
        description="CSV eller XLSX. Forhåndsvis, tilknyt kolonner, validér, prøvekør og gennemfør. Ingen fil importeres uden en prøvekørsel."
        actions={<Link href="/panel" className="text-sm text-accent hover:underline">← Panel</Link>}
      />
      <ImportWizard attributeFields={attributeKeys} history={batches} />
    </div>
  );
}
