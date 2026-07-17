"use server";

import { revalidatePath } from "next/cache";
import { withAuthorized } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function createInsight(input: {
  title: string;
  summary: string;
  decision?: string;
  tags: string[];
  links: { entityType: string; entityId: string; note?: string }[];
}) {
  await withAuthorized("insights.manage", async (tx, session) => {
    const [insight] = await tx`
      insert into insights (org_id, title, summary, decision, status, owner_id, tags)
      values (${session.orgId}, ${input.title.trim()}, ${input.summary.trim()},
              ${input.decision?.trim() || null}, 'draft', ${session.userId}, ${input.tags})
      returning id`;
    for (const link of input.links) {
      await tx`insert into evidence_links (org_id, insight_id, entity_type, entity_id, note)
               values (${session.orgId}, ${insight.id}, ${link.entityType}, ${link.entityId}, ${link.note ?? null})`;
    }
    await audit(tx, {
      orgId: session.orgId, actorUserId: session.userId,
      action: "insight.create", entityType: "insight", entityId: insight.id as string,
    });
  });
  revalidatePath("/insights");
}

export async function setInsightStatus(insightId: string, status: "draft" | "validated" | "archived") {
  await withAuthorized("insights.manage", async (tx) => {
    await tx`update insights set status = ${status}, updated_at = now() where id = ${insightId}`;
  });
  revalidatePath("/insights");
}
