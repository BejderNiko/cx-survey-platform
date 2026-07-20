"use server";

import { revalidatePath } from "next/cache";
import { segmentDefinition } from "@ok/domain";
import { withAuthorized } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { listPanelists } from "@/lib/data/panel";

export async function addNote(panelistId: string, body: string) {
  if (!body.trim()) return;
  await withAuthorized("panel.edit", async (tx, session) => {
    await tx`insert into panelist_notes (org_id, panelist_id, author_id, body)
             values (${session.orgId}, ${panelistId}, ${session.userId}, ${body.trim()})`;
  });
  revalidatePath(`/panel/${panelistId}`);
}

export async function addTagToPanelist(panelistId: string, tagName: string) {
  if (!tagName.trim()) return;
  await withAuthorized("panel.edit", async (tx, session) => {
    const name = tagName.trim().toLowerCase();
    const [tag] = await tx`
      insert into tags (org_id, name) values (${session.orgId}, ${name})
      on conflict (org_id, name) do update set name = excluded.name
      returning id`;
    await tx`insert into panelist_tags (panelist_id, tag_id, org_id)
             values (${panelistId}, ${tag.id}, ${session.orgId}) on conflict do nothing`;
  });
  revalidatePath(`/panel/${panelistId}`);
}

export async function removeTagFromPanelist(panelistId: string, tagId: string) {
  await withAuthorized("panel.edit", async (tx) => {
    await tx`delete from panelist_tags where panelist_id = ${panelistId} and tag_id = ${tagId}`;
  });
  revalidatePath(`/panel/${panelistId}`);
}

export async function bulkTag(panelistIds: string[], tagName: string) {
  if (panelistIds.length === 0 || !tagName.trim()) return { tagged: 0 };
  const tagged = await withAuthorized("panel.edit", async (tx, session) => {
    const name = tagName.trim().toLowerCase();
    const [tag] = await tx`
      insert into tags (org_id, name) values (${session.orgId}, ${name})
      on conflict (org_id, name) do update set name = excluded.name
      returning id`;
    const rows = await tx`
      insert into panelist_tags (panelist_id, tag_id, org_id)
      select p.id, ${tag.id}, ${session.orgId} from panelists p where p.id = any(${panelistIds})
      on conflict do nothing
      returning panelist_id`;
    return rows.length;
  });
  revalidatePath("/panel");
  return { tagged };
}

/**
 * Irreversible GDPR anonymization: scrubs identity fields, removes notes and
 * attribute values, and breaks the link from responses/invitations so research
 * data can no longer be traced to the person.
 */
export async function anonymizePanelist(panelistId: string) {
  await withAuthorized("panel.anonymize", async (tx, session) => {
    const invitations = await tx`select id from invitations where panelist_id = ${panelistId}`;
    const invitationIds = invitations.map((invitation) => invitation.id as string);
    if (invitationIds.length > 0) {
      await tx`update outbox_messages set
                 to_address = 'anonymized@example.invalid', subject = '[anonymized]', body = '[anonymized]'
               where invitation_id = any(${invitationIds})`;
      await tx`update invitations set panelist_id = null, status = 'unsubscribed',
                 token = 'revoked_' || replace(id::text, '-', ''), status_changed_at = now()
               where id = any(${invitationIds})`;
    }
    await tx`update responses set panelist_id = null where panelist_id = ${panelistId}`;
    await tx`update contact_events set detail = '{}'::jsonb where panelist_id = ${panelistId}`;
    await tx`delete from panelist_notes where panelist_id = ${panelistId}`;
    await tx`delete from panelist_attributes where panelist_id = ${panelistId}`;
    await tx`delete from panelist_tags where panelist_id = ${panelistId}`;
    await tx`update consent_records set status = 'withdrawn', withdrawn_at = now()
             where panelist_id = ${panelistId} and status = 'granted'`;
    await tx`update panelists set
               first_name = null, last_name = null, email = null, phone = null,
               gender = null, birth_year = null, city = null, postal_code = null,
               external_id = null, recruitment_source = null,
               lifecycle = 'anonymized', anonymized_at = now(), updated_at = now()
             where id = ${panelistId}`;
    await audit(tx, {
      orgId: session.orgId,
      actorUserId: session.userId,
      action: "panel.anonymize",
      entityType: "panelist",
      entityId: panelistId,
    });
  });
  revalidatePath(`/panel/${panelistId}`);
  revalidatePath("/panel");
}

export async function createSegment(name: string, description: string, definitionRaw: unknown) {
  const def = segmentDefinition.parse(definitionRaw);
  await withAuthorized("segments.manage", async (tx, session) => {
    await tx`insert into segments (org_id, name, description, definition, created_by)
             values (${session.orgId}, ${name.trim()}, ${description.trim() || null}, ${tx.json(def as never)}, ${session.userId})`;
  });
  revalidatePath("/panel/segments");
}

export async function deleteSegment(segmentId: string) {
  await withAuthorized("segments.manage", async (tx) => {
    await tx`delete from segments where id = ${segmentId}`;
  });
  revalidatePath("/panel/segments");
}

/** Preview how many panelists a segment definition currently matches. */
export async function previewSegmentCount(definitionRaw: unknown): Promise<number> {
  const def = segmentDefinition.parse(definitionRaw);
  return withAuthorized("panel.view", async (tx) => {
    const { total } = await listPanelists(tx, { segment: def, limit: 1 });
    return total;
  });
}
