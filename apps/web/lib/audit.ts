import type { Tx } from "./db";

/** Record an important action in the tenant audit log (same transaction). */
export async function audit(
  tx: Tx,
  entry: {
    orgId: string;
    actorUserId: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await tx`
    insert into audit_events (org_id, actor_user_id, action, entity_type, entity_id, details)
    values (${entry.orgId}, ${entry.actorUserId}, ${entry.action}, ${entry.entityType},
            ${entry.entityId ?? null}, ${tx.json((entry.details ?? {}) as never)})`;
}
