import { withAuthorized } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { exportDatasetRemote } from "@/lib/analytics-client";
import { loadDatasetPayload } from "@/lib/data/datasets";

const FORMATS = new Set(["csv", "xlsx", "json", "sav"]);

/** Permission-checked raw/filtered data export via the analytics service. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = new URL(request.url).searchParams.get("format") ?? "csv";
  if (!FORMATS.has(format)) return new Response("Unsupported format", { status: 422 });

  try {
    const out = await withAuthorized("datasets.export", async (tx, session) => {
      const payload = await loadDatasetPayload(tx, id);
      if (!payload) return null;
      const [info] = await tx`
        select d.name, dv.version_number from dataset_versions dv
        join datasets d on d.id = dv.dataset_id where dv.id = ${id}`;
      const filename = `${info.name}-v${info.version_number}`.replace(/[^\w.-]+/g, "_");
      const res = await exportDatasetRemote(format, payload, filename);
      await audit(tx, {
        orgId: session.orgId, actorUserId: session.userId,
        action: "dataset.export", entityType: "dataset_version", entityId: id,
        details: { format, rows: payload.rows.length },
      });
      return res;
    });
    if (!out) return new Response("Not found", { status: 404 });
    return new Response(out.bytes, {
      headers: { "Content-Type": out.contentType, "Content-Disposition": out.disposition },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Export failed", { status: 502 });
  }
}
