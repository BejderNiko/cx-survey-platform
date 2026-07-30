import Link from "next/link";
import { assertCan } from "@ok/domain";
import { PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { RawDataImport } from "./raw-data-import";

export default async function RawDataImportPage() {
  const session = await requireSession();
  assertCan(session.role, "datasets.create");
  return (
    <div className="space-y-4">
      <PageHeader
        title="Importér rådata"
        description="CSV/XLSX → preview → worksheet → mapping → metadata → datasætversion → analyse-workbench"
        actions={<Link href="/analytics" className="text-sm text-accent hover:underline">← Analyse</Link>}
      />
      <RawDataImport />
    </div>
  );
}
