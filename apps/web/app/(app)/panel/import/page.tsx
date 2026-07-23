import Link from "next/link";
import { assertCan } from "@ok/domain";
import { PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { ImportWizard } from "./import-wizard";
import { listBatches } from "./actions";

export default async function ImportPage() {
  const session = await requireSession();
  assertCan(session.role, "panel.import");
  const batches = await listBatches();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Importér panelister"
        description="Upload CSV eller XLSX. Platformen mapper, validerer og håndterer dubletter automatisk."
        actions={<Link href="/panel" className="text-sm text-accent hover:underline">← Panel</Link>}
      />
      <ImportWizard history={batches} />
    </div>
  );
}
