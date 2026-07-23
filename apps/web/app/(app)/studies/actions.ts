"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  METRIC_DEFINITIONS,
  allQuestions,
  instrumentDefinition,
  validateInstrument,
  toDanishDraft,
  type InstrumentDefinition,
} from "@ok/domain";
import { withAuthorized } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { deleteStimulusObjectWithRetry } from "@/lib/stimulus-storage";

const BLANK_SURVEY: InstrumentDefinition = {
  languages: ["da"],
  defaultLanguage: "da",
  blocks: [{ id: "b1", questions: [] }],
  messages: {},
};

export async function createStudy(input: {
  title: string;
  workspaceId: string;
  templateId?: string | null;
  studyType?: string;
}) {
  const studyId = await withAuthorized("studies.create", async (tx, session) => {
    let definition: InstrumentDefinition = BLANK_SURVEY;
    let methodTags: string[] = [];
    if (input.templateId) {
      const [tpl] = await tx`select definition, category from templates where id = ${input.templateId}`;
      if (tpl) {
        definition = toDanishDraft(instrumentDefinition.parse(tpl.definition));
        methodTags = [tpl.category as string];
      }
    }
    const [study] = await tx`
      insert into studies (org_id, workspace_id, title, study_type, method_tags, status, owner_id, draft_definition)
      values (${session.orgId}, ${input.workspaceId}, ${input.title.trim()},
              ${input.studyType ?? "survey"}, ${methodTags}, 'draft', ${session.userId},
              ${tx.json(definition as never)})
      returning id`;
    await audit(tx, {
      orgId: session.orgId, actorUserId: session.userId,
      action: "study.create", entityType: "study", entityId: study.id as string,
    });
    return study.id as string;
  });
  redirect(`/studies/${studyId}/builder`);
}

export async function updateDraft(studyId: string, definitionRaw: unknown) {
  const def = toDanishDraft(instrumentDefinition.parse(definitionRaw));
  await withAuthorized("studies.edit", async (tx) => {
    await tx`update studies set draft_definition = ${tx.json(def as never)}, updated_at = now()
             where id = ${studyId} and status in ('draft','review','live','paused')`;
  });
  revalidatePath(`/studies/${studyId}`);
  return { ok: true, problems: validateInstrument(def) };
}

export async function publishStudy(studyId: string) {
  const result = await withAuthorized("studies.publish", async (tx, session) => {
    const [study] = await tx`select draft_definition, status from studies where id = ${studyId}`;
    if (!study) throw new Error("Studiet blev ikke fundet");
    const def = instrumentDefinition.parse(study.draft_definition);
    const problems = validateInstrument(def);
    if (problems.length > 0) return { ok: false as const, problems };

    // Snapshot the metric definitions for metric question types present.
    const types = new Set(allQuestions(def).map((q) => q.type));
    const metricDefs: Record<string, unknown> = {};
    if (types.has("nps")) metricDefs.nps = METRIC_DEFINITIONS.nps;
    if (types.has("csat")) metricDefs.csat = METRIC_DEFINITIONS.csat;
    if (types.has("ces")) metricDefs.ces = METRIC_DEFINITIONS.ces;

    const [next] = await tx`
      select coalesce(max(version_number), 0) + 1 as v from study_versions where study_id = ${studyId}`;
    await tx`
      insert into study_versions (org_id, study_id, version_number, definition, metric_definitions, published_by)
      values (${session.orgId}, ${studyId}, ${next.v}, ${tx.json(def as never)},
              ${tx.json(metricDefs as never)}, ${session.userId})`;
    await tx`update studies set status = 'live', updated_at = now() where id = ${studyId}`;
    await audit(tx, {
      orgId: session.orgId, actorUserId: session.userId,
      action: "study.publish", entityType: "study", entityId: studyId,
      details: { version: Number(next.v) },
    });
    return { ok: true as const, version: Number(next.v), problems: [] as string[] };
  });
  revalidatePath(`/studies/${studyId}`);
  return result;
}

export async function setStudyStatus(studyId: string, status: "paused" | "closed" | "live" | "archived") {
  await withAuthorized("studies.close", async (tx, session) => {
    await tx`update studies set status = ${status}::study_status, updated_at = now() where id = ${studyId}`;
    await audit(tx, {
      orgId: session.orgId, actorUserId: session.userId,
      action: `study.${status}`, entityType: "study", entityId: studyId,
    });
  });
  revalidatePath(`/studies/${studyId}`);
  revalidatePath("/studies");
}

export type DeleteStudyResult =
  | { ok: true }
  | { ok: false; reason: string; canArchive: boolean };

/** Hard-delete only dependency-free drafts. Everything else must be archived. */
export async function deleteStudy(studyId: string): Promise<DeleteStudyResult> {
  const result = await withAuthorized("studies.delete", async (tx, session) => {
    const [study] = await tx`
      select s.status,
             (select count(*)::int from study_versions v where v.study_id = s.id) as versions,
             (select count(*)::int from distributions d where d.study_id = s.id) as distributions,
             (select count(*)::int from responses r where r.study_id = s.id) as responses,
             (select count(*)::int from followup_rules f where f.study_id = s.id) as followup_rules,
             (select count(*)::int from datasets ds where ds.source_study_id = s.id) as datasets
      from studies s
      where s.id = ${studyId} and s.org_id = ${session.orgId}
      for update`;

    if (!study) {
      return { ok: false as const, reason: "Studiet blev ikke fundet.", canArchive: false };
    }

    const dependencies = [
      ["publicerede versioner", Number(study.versions)],
      ["udsendelser", Number(study.distributions)],
      ["besvarelser", Number(study.responses)],
      ["opfølgningsregler", Number(study.followup_rules)],
      ["datasæt", Number(study.datasets)],
    ].filter(([, count]) => Number(count) > 0);

    if (study.status !== "draft" || dependencies.length > 0) {
      const detail = dependencies.map(([name, count]) => `${count} ${name}`).join(", ");
      return {
        ok: false as const,
        reason: detail
          ? `Studiet har afhængigheder (${detail}) og kan derfor kun arkiveres.`
          : "Kun studier med status kladde kan slettes. Arkivér studiet i stedet.",
        canArchive: true,
      };
    }

    const media = await tx`select storage_key from media_assets where study_id = ${studyId} and org_id = ${session.orgId}`;
    await audit(tx, {
      orgId: session.orgId, actorUserId: session.userId,
      action: "study.delete", entityType: "study", entityId: studyId,
      details: { status: "draft", dependencyCount: 0, mediaAssetCount: media.length },
    });
    await tx`delete from comments where org_id = ${session.orgId}
             and entity_type = 'study' and entity_id = ${studyId}`;
    const deleted = await tx`delete from studies where id = ${studyId} and org_id = ${session.orgId} returning id`;
    if (deleted.length !== 1) throw new Error("Studiet kunne ikke slettes sikkert.");
    return { ok: true as const, storageKeys: media.map((row) => String(row.storage_key)) };
  });

  if (result.ok) {
    const cleanup = await Promise.allSettled(result.storageKeys.map((key) => deleteStimulusObjectWithRetry(key)));
    const failed = cleanup.filter((item) => item.status === "rejected").length;
    if (failed > 0) {
      console.error("Study stimulus cleanup incomplete", {
        reference: "STIM-" + crypto.randomUUID().slice(0, 8).toUpperCase(),
        failedCount: failed,
      });
    }
  }
  revalidatePath("/studies");
  return result.ok ? { ok: true } : result;
}

/** Duplicate a study without responses, distributions, or tokens. */
export async function duplicateStudy(studyId: string) {
  const newId = await withAuthorized("studies.create", async (tx, session) => {
    const [src] = await tx`select title, workspace_id, study_type, method_tags, draft_definition, theme, settings
                           from studies where id = ${studyId}`;
    if (!src) throw new Error("Studiet blev ikke fundet");
    const draftDefinition = toDanishDraft(instrumentDefinition.parse(src.draft_definition));
    const [copy] = await tx`
      insert into studies (org_id, workspace_id, title, study_type, method_tags, status, owner_id,
                           draft_definition, theme, settings)
      values (${session.orgId}, ${src.workspace_id}, ${src.title + " (kopi)"}, ${src.study_type},
              ${src.method_tags}, 'draft', ${session.userId}, ${tx.json(draftDefinition as never)},
              ${tx.json(src.theme)}, ${tx.json(src.settings)})
      returning id`;
    await audit(tx, {
      orgId: session.orgId, actorUserId: session.userId,
      action: "study.duplicate", entityType: "study", entityId: copy.id as string,
      details: { sourceStudyId: studyId },
    });
    return copy.id as string;
  });
  redirect(`/studies/${newId}/builder`);
}

export type CommentActionResult = { ok: true } | { ok: false; error: string };

export async function addStudyComment(input: {
  studyId: string;
  body: string;
  questionCode?: string | null;
  parentId?: string;
}): Promise<CommentActionResult> {
  const body = input.body.trim();
  if (!body) return { ok: false, error: "Kommentaren er tom." };
  if (body.length > 4000) return { ok: false, error: "Kommentaren må højst være 4.000 tegn." };
  const result = await withAuthorized("comments.create", async (tx, session) => {
    const [study] = await tx`
      select draft_definition from studies
      where id = ${input.studyId} and org_id = ${session.orgId}`;
    if (!study) return { ok: false as const, error: "Studiet blev ikke fundet." };

    let questionCode = input.questionCode?.trim() || null;
    if (questionCode) {
      const definition = instrumentDefinition.parse(study.draft_definition);
      if (!allQuestions(definition).some((question) => question.code === questionCode)) {
        return { ok: false as const, error: "Spørgsmålet findes ikke i studiets kladde." };
      }
    }

    let parentId: string | null = null;
    if (input.parentId) {
      const [parent] = await tx`
        select id, question_code, parent_id from comments
        where id = ${input.parentId} and org_id = ${session.orgId}
          and study_id = ${input.studyId}`;
      if (!parent || parent.parent_id) return { ok: false as const, error: "Kommentartråden blev ikke fundet." };
      parentId = parent.id as string;
      questionCode = (parent.question_code as string | null) ?? null;
    }

    const [comment] = await tx`
      insert into comments (org_id, entity_type, entity_id, study_id, question_code, parent_id, author_id, body)
      values (${session.orgId}, 'study', ${input.studyId}, ${input.studyId}, ${questionCode},
              ${parentId}, ${session.userId}, ${body})
      returning id`;
    await audit(tx, {
      orgId: session.orgId, actorUserId: session.userId, action: "comment.create",
      entityType: "study", entityId: input.studyId,
      details: { commentId: comment.id as string, questionCode, parentId },
    });
    return { ok: true as const };
  });
  revalidatePath(`/studies/${input.studyId}`);
  revalidatePath(`/studies/${input.studyId}/builder`);
  return result;
}

export async function resolveStudyComment(commentId: string, resolved: boolean): Promise<CommentActionResult> {
  const result = await withAuthorized("comments.resolve", async (tx, session) => {
    const [comment] = await tx`
      update comments
      set status = ${resolved ? "resolved" : "open"},
          resolved_by = ${resolved ? session.userId : null},
          resolved_at = ${resolved ? new Date() : null}
      where id = ${commentId} and org_id = ${session.orgId} and entity_type = 'study' and parent_id is null
      returning study_id, question_code`;
    if (!comment) return { ok: false as const, error: "Kommentaren blev ikke fundet." };
    await audit(tx, {
      orgId: session.orgId, actorUserId: session.userId,
      action: resolved ? "comment.resolve" : "comment.reopen",
      entityType: "study", entityId: comment.study_id as string,
      details: { commentId, questionCode: comment.question_code as string | null },
    });
    return { ok: true as const, studyId: comment.study_id as string };
  });
  if (!result.ok) return result;
  revalidatePath(`/studies/${result.studyId}`);
  revalidatePath(`/studies/${result.studyId}/builder`);
  return { ok: true };
}
