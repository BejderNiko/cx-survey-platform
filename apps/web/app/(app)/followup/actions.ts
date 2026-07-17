"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { condition, followupAction } from "@ok/domain";
import { withAuthorized } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function updateCase(
  caseId: string,
  patch: { status?: string; assigneeId?: string | null; resolution?: string },
) {
  await withAuthorized("followup.manage", async (tx, session) => {
    const [existing] = await tx`select status, assignee_id from followup_cases where id = ${caseId}`;
    if (!existing) throw new Error("Case not found");
    const status = patch.status ?? existing.status;
    const assigneeId = patch.assigneeId === undefined ? existing.assignee_id : patch.assigneeId;
    await tx`
      update followup_cases set
        status = ${status}::case_status,
        assignee_id = ${assigneeId},
        resolution = coalesce(${patch.resolution ?? null}, resolution),
        resolved_at = case when ${status} in ('resolved','dismissed') then now() else null end,
        updated_at = now()
      where id = ${caseId}`;
    await tx`insert into followup_activity (org_id, case_id, actor_id, activity_type, detail)
             values (${session.orgId}, ${caseId}, ${session.userId},
                     ${patch.status ? "status_change" : "assigned"},
                     ${tx.json({ to: status, assigneeId } as never)})`;
    if (patch.assigneeId && patch.assigneeId !== existing.assignee_id) {
      await tx`insert into notifications (org_id, user_id, kind, title, entity_type, entity_id)
               values (${session.orgId}, ${patch.assigneeId}, 'assignment', 'A follow-up case was assigned to you', 'followup_case', ${caseId})`;
    }
  });
  revalidatePath("/followup");
}

export async function addCaseNote(caseId: string, body: string) {
  if (!body.trim()) return;
  await withAuthorized("followup.manage", async (tx, session) => {
    await tx`insert into followup_activity (org_id, case_id, actor_id, activity_type, detail)
             values (${session.orgId}, ${caseId}, ${session.userId}, 'note', ${tx.json({ body: body.trim() })})`;
  });
  revalidatePath("/followup");
}

const ruleInput = z.object({
  name: z.string().min(1),
  studyId: z.string().nullable(),
  conditions: z.array(condition).min(1),
  actions: z.array(followupAction).min(1),
});

export async function createRule(raw: unknown) {
  const input = ruleInput.parse(raw);
  await withAuthorized("followup.rules.manage", async (tx, session) => {
    const [rule] = await tx`
      insert into followup_rules (org_id, study_id, name, is_active, conditions, actions, created_by)
      values (${session.orgId}, ${input.studyId}, ${input.name}, true,
              ${tx.json(input.conditions as never)}, ${tx.json(input.actions as never)}, ${session.userId})
      returning id`;
    await audit(tx, {
      orgId: session.orgId, actorUserId: session.userId,
      action: "followup.rule.create", entityType: "followup_rule", entityId: rule.id as string,
    });
  });
  revalidatePath("/followup");
}

export async function toggleRule(ruleId: string, isActive: boolean) {
  await withAuthorized("followup.rules.manage", async (tx) => {
    await tx`update followup_rules set is_active = ${isActive} where id = ${ruleId}`;
  });
  revalidatePath("/followup");
}
