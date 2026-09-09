import "server-only";

import { allQuestions, assertCan, instrumentDefinition, type Role } from "@ok/domain";
import type { SessionUser } from "@/lib/auth";
import { withUser } from "@/lib/db";

export class FigmaDraftAccessError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409,
    readonly code: string,
  ) {
    super(message);
  }
}

/**
 * Bind every Figma OAuth/REST operation to one editable prototype question in
 * the caller's RLS-scoped draft. A supplied file key must match that draft.
 */
export async function assertFigmaDraftAccess(
  session: SessionUser,
  studyId: string,
  questionCode: string,
  expectedFileKey?: string,
): Promise<void> {
  await withUser(session.userId, session.orgId, async (tx) => {
    const [membership] = await tx`
      select m.role
      from memberships m
      join users u on u.id = m.user_id
      where m.user_id = ${session.userId} and m.org_id = ${session.orgId}
        and m.deactivated_at is null and u.is_active`;
    if (!membership) throw new FigmaDraftAccessError("Active membership is required.", 403, "forbidden");
    try {
      assertCan(membership.role as Role, "studies.edit");
    } catch {
      throw new FigmaDraftAccessError("Study edit permission is required.", 403, "forbidden");
    }

    const [study] = await tx`
      select draft_definition
      from studies
      where id = ${studyId} and org_id = ${session.orgId}`;
    if (!study) throw new FigmaDraftAccessError("Study was not found.", 404, "study_not_found");

    const parsed = instrumentDefinition.safeParse(study.draft_definition);
    if (!parsed.success) throw new FigmaDraftAccessError("Study draft is invalid.", 409, "invalid_study_draft");
    const question = allQuestions(parsed.data).find((candidate) => candidate.code === questionCode);
    if (!question || question.type !== "prototype_test" || !question.prototype) {
      throw new FigmaDraftAccessError("Prototype question was not found.", 404, "prototype_question_not_found");
    }
    if (expectedFileKey !== undefined && question.prototype.fileKey !== expectedFileKey) {
      throw new FigmaDraftAccessError("Figma file key does not match study draft.", 403, "figma_file_mismatch");
    }
  });
}

export function figmaDraftAccessResponse(error: unknown): Response {
  if (error instanceof FigmaDraftAccessError) {
    return Response.json({ error: error.code }, { status: error.status });
  }
  return Response.json({ error: "figma_access_failed" }, { status: 500 });
}
