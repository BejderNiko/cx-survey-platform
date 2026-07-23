import { getSession } from "@/lib/auth";
import { adminSql, withUser } from "@/lib/db";
import { getStimulusObject } from "@/lib/stimulus-storage";

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return new Response("Not found", { status: 404 });
  const session = await getSession();
  let asset: { storage_key: string; content_type: string } | null = null;

  if (session) {
    asset = await withUser(session.userId, session.orgId, async (tx) => {
      const [row] = await tx`
        select storage_key, content_type from media_assets
        where id = ${id} and org_id = ${session.orgId}`;
      return row ? { storage_key: String(row.storage_key), content_type: String(row.content_type) } : null;
    });
  } else {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    if (!token || token.length > 200) return new Response("Not found", { status: 404 });
    const [row] = await adminSql`
      select m.storage_key, m.content_type
      from media_assets m
      join studies s on s.id = m.study_id and s.org_id = m.org_id
      where m.id = ${id} and s.status = 'live'
        and (
          exists (
            select 1 from distributions d
            join study_versions v on v.id = d.study_version_id and v.org_id = d.org_id
            where d.study_id = m.study_id and d.org_id = m.org_id
              and d.kind = 'public_link' and d.status = 'active' and d.public_token = ${token}
              and jsonb_path_exists(v.definition, '$.**.assetId ? (@ == $asset)',
                    jsonb_build_object('asset', to_jsonb(m.id::text)))
          )
          or exists (
            select 1 from invitations i
            join distributions d on d.id = i.distribution_id and d.org_id = i.org_id
            join study_versions v on v.id = d.study_version_id and v.org_id = d.org_id
            where d.study_id = m.study_id and d.org_id = m.org_id
              and d.status = 'active' and i.token = ${token}
              and i.status not in ('bounced', 'unsubscribed', 'failed')
              and jsonb_path_exists(v.definition, '$.**.assetId ? (@ == $asset)',
                    jsonb_build_object('asset', to_jsonb(m.id::text)))
          )
        )`;
    asset = row ? { storage_key: String(row.storage_key), content_type: String(row.content_type) } : null;
  }

  if (!asset) return new Response("Not found", { status: 404 });
  try {
    const object = await getStimulusObject(asset.storage_key, asset.content_type);
    return new Response(object.bytes.slice().buffer as ArrayBuffer, {
      headers: {
        "content-type": object.contentType,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
