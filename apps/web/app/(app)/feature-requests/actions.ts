"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { withAuthorized } from "@/lib/auth";

const STATUSES = new Set(["new", "planned", "in_progress", "done", "declined"]);

export type FeatureRequestActionResult = { ok: true } | { ok: false; error: string };

export async function createFeatureRequest(input: { title: string; description: string }): Promise<FeatureRequestActionResult> {
  const title = input.title.trim();
  const description = input.description.trim();
  if (title.length < 3 || title.length > 160) return { ok: false, error: "Titel skal være 3-160 tegn." };
  if (description.length < 1 || description.length > 5000) return { ok: false, error: "Beskrivelse skal være 1-5.000 tegn." };
  try {
    await withAuthorized("feature_requests.create", async (tx, session) => {
      const [request] = await tx`
        insert into feature_requests (org_id, title, description, created_by)
        values (${session.orgId}, ${title}, ${description}, ${session.userId}) returning id`;
      await tx`
        insert into feature_request_events (org_id, feature_request_id, actor_user_id, event_type, details)
        values (${session.orgId}, ${request.id}, ${session.userId}, 'created', ${tx.json({ title } as never)})`;
      await audit(tx, { orgId: session.orgId, actorUserId: session.userId, action: "feature_request.create", entityType: "feature_request", entityId: String(request.id), details: { titleLength: title.length, descriptionLength: description.length } });
    });
  } catch (error) {
    return { ok: false, error: schemaMessage(error) };
  }
  revalidatePath("/feature-requests");
  return { ok: true };
}

export async function updateFeatureRequest(input: { id: string; status: string; ownerId?: string | null }): Promise<FeatureRequestActionResult> {
  if (!STATUSES.has(input.status)) return { ok: false, error: "Ugyldig status." };
  try {
    await withAuthorized("feature_requests.manage", async (tx, session) => {
      const ownerId = input.ownerId?.trim() || null;
      if (ownerId) {
        const [owner] = await tx`select user_id from memberships where org_id = ${session.orgId} and user_id = ${ownerId} and deactivated_at is null`;
        if (!owner) throw new Error("Ejeren er ikke aktivt medlem af organisationen.");
      }
      const [before] = await tx`select status, owner_id from feature_requests where id = ${input.id} and org_id = ${session.orgId} for update`;
      if (!before) throw new Error("Feature request blev ikke fundet.");
      await tx`update feature_requests set status = ${input.status}::feature_request_status, owner_id = ${ownerId}, updated_at = now() where id = ${input.id} and org_id = ${session.orgId}`;
      if (String(before.status) !== input.status) await tx`
        insert into feature_request_events (org_id, feature_request_id, actor_user_id, event_type, details)
        values (${session.orgId}, ${input.id}, ${session.userId}, 'status_changed', ${tx.json({ from: before.status, to: input.status } as never)})`;
      if ((before.owner_id ? String(before.owner_id) : null) !== ownerId) await tx`
        insert into feature_request_events (org_id, feature_request_id, actor_user_id, event_type, details)
        values (${session.orgId}, ${input.id}, ${session.userId}, 'owner_changed', ${tx.json({ from: before.owner_id, to: ownerId } as never)})`;
      await audit(tx, { orgId: session.orgId, actorUserId: session.userId, action: "feature_request.update", entityType: "feature_request", entityId: input.id, details: { status: input.status, ownerId } });
    });
  } catch (error) {
    return { ok: false, error: schemaMessage(error) };
  }
  revalidatePath("/feature-requests");
  return { ok: true };
}

function schemaMessage(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && error.code === "42P01") return "Migration 20260812000013 er ikke anvendt i dette miljø.";
  return error instanceof Error ? error.message : "Handlingen mislykkedes.";
}
