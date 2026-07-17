"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  METRIC_DEFINITIONS,
  allQuestions,
  instrumentDefinition,
  validateInstrument,
  type InstrumentDefinition,
} from "@ok/domain";
import { withAuthorized } from "@/lib/auth";
import { audit } from "@/lib/audit";

const BLANK_SURVEY: InstrumentDefinition = {
  languages: ["da", "en"],
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
        definition = instrumentDefinition.parse(tpl.definition);
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
  const def = instrumentDefinition.parse(definitionRaw);
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
    if (!study) throw new Error("Study not found");
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

/** Duplicate a study without responses, distributions, or tokens. */
export async function duplicateStudy(studyId: string) {
  const newId = await withAuthorized("studies.create", async (tx, session) => {
    const [src] = await tx`select title, workspace_id, study_type, method_tags, draft_definition, theme, settings
                           from studies where id = ${studyId}`;
    if (!src) throw new Error("Study not found");
    const [copy] = await tx`
      insert into studies (org_id, workspace_id, title, study_type, method_tags, status, owner_id,
                           draft_definition, theme, settings)
      values (${session.orgId}, ${src.workspace_id}, ${src.title + " (kopi)"}, ${src.study_type},
              ${src.method_tags}, 'draft', ${session.userId}, ${tx.json(src.draft_definition)},
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

export async function addComment(entityType: string, entityId: string, body: string, pathToRevalidate: string) {
  if (!body.trim()) return;
  await withAuthorized("comments.create", async (tx, session) => {
    await tx`insert into comments (org_id, entity_type, entity_id, author_id, body)
             values (${session.orgId}, ${entityType}, ${entityId}, ${session.userId}, ${body.trim()})`;
  });
  revalidatePath(pathToRevalidate);
}
