import { assertCan } from "@ok/domain";
import { getSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { getStimulusObject } from "@/lib/stimulus-storage";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  try { assertCan(session.role, "reports.create"); } catch { return Response.json({ error: "forbidden" }, { status: 403 }); }
  const { id } = await params;
  const job = await withUser(session.userId, session.orgId, async (tx) => {
    const [row] = await tx`
      select r.output_storage_key, r.output_content_type, r.format, r.output_sha256, s.title
      from report_jobs r join studies s on s.id = r.study_id and s.org_id = r.org_id
      where r.id = ${id} and r.org_id = ${session.orgId} and r.status = 'succeeded'`;
    return row ?? null;
  });
  if (!job) return new Response("Not found", { status: 404 });
  try {
    const object = await getStimulusObject(String(job.output_storage_key), String(job.output_content_type));
    const filename = String(job.title).normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "report";
    return new Response(object.bytes.slice().buffer as ArrayBuffer, { headers: { "content-type": object.contentType, "content-disposition": `attachment; filename="${filename}-draft.${job.format}"`, "cache-control": "private, no-store", "x-content-sha256": String(job.output_sha256), "x-report-release-status": "draft_unbranded" } });
  } catch { return new Response("Not found", { status: 404 }); }
}
