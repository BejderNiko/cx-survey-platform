import { withAuthorized } from "@/lib/auth";

/** Downloadable CSV error report for an import batch (permission-checked, RLS-scoped). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await withAuthorized("panel.view", async (tx) => {
    const [batch] = await tx`select filename, error_report from import_batches where id = ${id}`;
    return batch ?? null;
  });
  if (!report) return new Response("Not found", { status: 404 });

  const rows = (report.error_report ?? []) as { rowNumber: number; column?: string; message: string }[];
  // Prevent CSV formula injection: prefix risky leading characters.
  const sanitize = (v: string) => (/^[=+\-@\t]/.test(v) ? `'${v}` : v);
  const csv = [
    "row,column,problem",
    ...rows.map((r) =>
      [String(r.rowNumber), r.column ?? "", r.message]
        .map((v) => `"${sanitize(String(v)).replaceAll('"', '""')}"`)
        .join(","),
    ),
  ].join("\r\n");

  return new Response("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="import-errors-${id}.csv"`,
    },
  });
}
