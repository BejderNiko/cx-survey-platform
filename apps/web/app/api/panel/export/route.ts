import { assertCan } from "@ok/domain";
import { getSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { listPanelists, parsePanelFilters, type PanelListParams } from "@/lib/data/panel";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  try { assertCan(session.role, "panel.export"); } catch { return Response.json({ error: "forbidden" }, { status: 403 }); }
  const url = new URL(request.url);
  const filters = parsePanelFilters(url.searchParams.get("filters") ?? undefined);
  const base: Omit<PanelListParams, "limit" | "offset"> = {
    q: url.searchParams.get("q") ?? undefined,
    tag: url.searchParams.get("tag") ?? undefined,
    lifecycle: url.searchParams.get("lifecycle") ?? undefined,
    customerStatus: url.searchParams.get("status") ?? undefined,
    language: url.searchParams.get("language") ?? undefined,
    filters,
    sort: "name",
  };
  const rows = await withUser(session.userId, session.orgId, async (tx) => {
    const output: Array<Awaited<ReturnType<typeof listPanelists>>["rows"][number]> = [];
    let offset = 0;
    let total = 0;
    do {
      const page = await listPanelists(tx, { ...base, limit: 500, offset });
      output.push(...page.rows);
      total = page.total;
      offset += page.rows.length;
      if (page.rows.length === 0) break;
    } while (offset < total);
    return output;
  });
  const header = ["panelist_id", "external_id", "first_name", "last_name", "email", "language", "birth_year", "gender", "city", "customer_status", "lifecycle", "tags", "has_consent", "attributes"];
  const csvRows = rows.map((row) => [
    row.id, row.external_id, row.first_name, row.last_name, row.email, row.language, row.birth_year,
    row.gender, row.city, row.customer_status, row.lifecycle, Array.isArray(row.tags) ? row.tags.join("|") : row.tags,
    row.has_consent, typeof row.attributes === "object" ? JSON.stringify(row.attributes) : row.attributes,
  ]);
  const csv = [header, ...csvRows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": "attachment; filename=panel-export.csv",
      "cache-control": "private, no-store",
      "x-export-count": String(rows.length),
    },
  });
}

function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}