"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withAuthorized } from "@/lib/auth";
import { audit } from "@/lib/audit";

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents (æ/ø/å keep as letters below)
    .toLowerCase()
    .replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40) || "side";
}

function newPublicToken(internalName: string): string {
  return `${randomBytes(6).toString("base64url")}_${slugify(internalName)}`;
}

export interface RecruitmentPageSummary {
  id: string;
  internalName: string;
  isActive: boolean;
  publicToken: string;
  questionLabels: string[];
  submissionCount: number;
}

export async function listRecruitmentPages(): Promise<RecruitmentPageSummary[]> {
  return withAuthorized("panel.view", async (tx) => {
    const rows = await tx`
      select rp.id, rp.internal_name, rp.is_active, rp.public_token,
             coalesce((
               select array_agg(cf.label order by rpq.position)
               from recruitment_page_questions rpq join custom_fields cf on cf.id = rpq.custom_field_id
               where rpq.recruitment_page_id = rp.id
             ), '{}') as question_labels,
             (select count(*) from recruitment_submissions rs where rs.recruitment_page_id = rp.id)::int as submission_count
      from recruitment_pages rp
      order by rp.created_at desc`;
    return rows.map((r) => ({
      id: r.id as string,
      internalName: r.internal_name as string,
      isActive: r.is_active as boolean,
      publicToken: r.public_token as string,
      questionLabels: r.question_labels as string[],
      submissionCount: r.submission_count as number,
    }));
  });
}

export async function listWorkspaces() {
  return withAuthorized("panel.view", async (tx) => {
    const rows = await tx`select id, name from workspaces order by name`;
    return rows.map((r) => ({ id: r.id as string, name: r.name as string }));
  });
}

export async function createRecruitmentPage(internalName: string, workspaceId: string) {
  const id = await withAuthorized("recruitment.manage", async (tx, session) => {
    const publicToken = newPublicToken(internalName);
    const [row] = await tx`
      insert into recruitment_pages (org_id, workspace_id, internal_name, public_token, page_title, created_by)
      values (${session.orgId}, ${workspaceId}, ${internalName.trim()}, ${publicToken}, ${internalName.trim()}, ${session.userId})
      returning id`;
    await audit(tx, {
      orgId: session.orgId, actorUserId: session.userId,
      action: "recruitment.create", entityType: "recruitment_page", entityId: row.id as string,
    });
    return row.id as string;
  });
  revalidatePath("/panel/recruitment");
  redirect(`/panel/recruitment/${id}`);
}

export interface RecruitmentPageDetail {
  id: string;
  internalName: string;
  isActive: boolean;
  publicToken: string;
  language: string;
  backgroundColor: string;
  someThumbnailUrl: string | null;
  pageTitle: string;
  pageContent: string;
  headerImageUrl: string | null;
  backgroundImageUrl: string | null;
  headerLogoPosition: string;
  thankYouContent: string;
  confirmationEmailTitle: string;
  confirmationEmailContent: string;
  confirmationEmailSenderName: string;
  screeningEnabled: boolean;
  screeningQuestionContent: string;
  screeningContinueLabel: string;
  screeningEndLabel: string;
  screeningEndContent: string;
}

export async function getRecruitmentPageForEdit(id: string) {
  return withAuthorized("panel.view", async (tx) => {
    const [row] = await tx`select * from recruitment_pages where id = ${id}`;
    if (!row) return null;
    const questions = await tx`
      select cf.id, cf.key, cf.label, cf.field_type, cf.options, rpq.required, rpq.position
      from recruitment_page_questions rpq join custom_fields cf on cf.id = rpq.custom_field_id
      where rpq.recruitment_page_id = ${id} order by rpq.position`;
    const availableFields = await tx`
      select id, key, label, field_type, options from custom_fields
      where id not in (
        select custom_field_id from recruitment_page_questions where recruitment_page_id = ${id}
      )
      order by label`;
    const detail: RecruitmentPageDetail = {
      id: row.id as string,
      internalName: row.internal_name as string,
      isActive: row.is_active as boolean,
      publicToken: row.public_token as string,
      language: row.language as string,
      backgroundColor: row.background_color as string,
      someThumbnailUrl: row.some_thumbnail_url as string | null,
      pageTitle: row.page_title as string,
      pageContent: row.page_content as string,
      headerImageUrl: row.header_image_url as string | null,
      backgroundImageUrl: row.background_image_url as string | null,
      headerLogoPosition: row.header_logo_position as string,
      thankYouContent: row.thank_you_content as string,
      confirmationEmailTitle: row.confirmation_email_title as string,
      confirmationEmailContent: row.confirmation_email_content as string,
      confirmationEmailSenderName: row.confirmation_email_sender_name as string,
      screeningEnabled: row.screening_enabled as boolean,
      screeningQuestionContent: row.screening_question_content as string,
      screeningContinueLabel: row.screening_continue_label as string,
      screeningEndLabel: row.screening_end_label as string,
      screeningEndContent: row.screening_end_content as string,
    };
    return {
      page: detail,
      questions: questions.map((q) => ({
        id: q.id as string, key: q.key as string, label: q.label as string,
        fieldType: q.field_type as string, options: (q.options ?? []) as string[],
        required: q.required as boolean, position: q.position as number,
      })),
      availableFields: availableFields.map((f) => ({
        id: f.id as string, key: f.key as string, label: f.label as string,
        fieldType: f.field_type as string, options: (f.options ?? []) as string[],
      })),
    };
  });
}

/** Only the columns the editor form is allowed to write, keyed exactly like the table. */
export interface RecruitmentPagePatch {
  internal_name?: string;
  language?: string;
  background_color?: string;
  some_thumbnail_url?: string | null;
  page_title?: string;
  page_content?: string;
  header_image_url?: string | null;
  background_image_url?: string | null;
  header_logo_position?: string;
  thank_you_content?: string;
  confirmation_email_title?: string;
  confirmation_email_content?: string;
  confirmation_email_sender_name?: string;
  screening_enabled?: boolean;
  screening_question_content?: string;
  screening_continue_label?: string;
  screening_end_label?: string;
  screening_end_content?: string;
}

export async function updateRecruitmentPage(id: string, patch: RecruitmentPagePatch) {
  await withAuthorized("recruitment.manage", async (tx) => {
    await tx`update recruitment_pages set ${tx(patch as never)}, updated_at = now() where id = ${id}`;
  });
  revalidatePath(`/panel/recruitment/${id}`);
  revalidatePath("/panel/recruitment");
}

export async function setRecruitmentPageActive(id: string, isActive: boolean) {
  await withAuthorized("recruitment.manage", async (tx) => {
    await tx`update recruitment_pages set is_active = ${isActive}, updated_at = now() where id = ${id}`;
  });
  revalidatePath("/panel/recruitment");
}

export async function setRecruitmentPageLink(id: string, publicToken: string) {
  const trimmed = publicToken.trim();
  if (!/^[a-zA-Z0-9_-]{3,80}$/.test(trimmed)) {
    throw new Error("Linket må kun indeholde bogstaver, tal, bindestreg og underscore (3-80 tegn).");
  }
  await withAuthorized("recruitment.manage", async (tx) => {
    const [clash] = await tx`select id from recruitment_pages where public_token = ${trimmed} and id != ${id}`;
    if (clash) throw new Error("Linket er allerede i brug af en anden side.");
    await tx`update recruitment_pages set public_token = ${trimmed}, updated_at = now() where id = ${id}`;
  });
  revalidatePath(`/panel/recruitment/${id}`);
}

export async function cloneRecruitmentPage(id: string) {
  const newId = await withAuthorized("recruitment.manage", async (tx, session) => {
    const [src] = await tx`select * from recruitment_pages where id = ${id}`;
    if (!src) throw new Error("Siden blev ikke fundet.");
    const name = `${src.internal_name} (kopi)`;
    const publicToken = newPublicToken(name);
    const [copy] = await tx`
      insert into recruitment_pages (
        org_id, workspace_id, internal_name, public_token, is_active, language, background_color,
        some_thumbnail_url, page_title, page_content, header_image_url, background_image_url,
        header_logo_position, thank_you_content, confirmation_email_title, confirmation_email_content,
        confirmation_email_sender_name, screening_enabled, screening_question_content,
        screening_continue_label, screening_end_label, screening_end_content, created_by
      ) values (
        ${src.org_id}, ${src.workspace_id}, ${name}, ${publicToken}, false, ${src.language}, ${src.background_color},
        ${src.some_thumbnail_url}, ${src.page_title}, ${src.page_content}, ${src.header_image_url}, ${src.background_image_url},
        ${src.header_logo_position}, ${src.thank_you_content}, ${src.confirmation_email_title}, ${src.confirmation_email_content},
        ${src.confirmation_email_sender_name}, ${src.screening_enabled}, ${src.screening_question_content},
        ${src.screening_continue_label}, ${src.screening_end_label}, ${src.screening_end_content}, ${session.userId}
      ) returning id`;
    await tx`
      insert into recruitment_page_questions (org_id, recruitment_page_id, custom_field_id, position, required)
      select ${session.orgId}, ${copy.id}, custom_field_id, position, required
      from recruitment_page_questions where recruitment_page_id = ${id}`;
    await audit(tx, {
      orgId: session.orgId, actorUserId: session.userId,
      action: "recruitment.clone", entityType: "recruitment_page", entityId: copy.id as string,
      details: { sourcePageId: id },
    });
    return copy.id as string;
  });
  revalidatePath("/panel/recruitment");
  redirect(`/panel/recruitment/${newId}`);
}

export async function deleteRecruitmentPage(id: string) {
  await withAuthorized("recruitment.manage", async (tx, session) => {
    await tx`delete from recruitment_pages where id = ${id}`;
    await audit(tx, {
      orgId: session.orgId, actorUserId: session.userId,
      action: "recruitment.delete", entityType: "recruitment_page", entityId: id,
    });
  });
  revalidatePath("/panel/recruitment");
  redirect("/panel/recruitment");
}

export async function addQuestionToPage(pageId: string, customFieldId: string) {
  await withAuthorized("recruitment.manage", async (tx, session) => {
    const [{ next }] = await tx`
      select coalesce(max(position), -1) + 1 as next from recruitment_page_questions where recruitment_page_id = ${pageId}`;
    await tx`
      insert into recruitment_page_questions (org_id, recruitment_page_id, custom_field_id, position)
      values (${session.orgId}, ${pageId}, ${customFieldId}, ${next})
      on conflict (recruitment_page_id, custom_field_id) do nothing`;
  });
  revalidatePath(`/panel/recruitment/${pageId}`);
}

export async function removeQuestionFromPage(pageId: string, customFieldId: string) {
  await withAuthorized("recruitment.manage", async (tx) => {
    await tx`delete from recruitment_page_questions
             where recruitment_page_id = ${pageId} and custom_field_id = ${customFieldId}`;
  });
  revalidatePath(`/panel/recruitment/${pageId}`);
}

export async function setQuestionRequired(pageId: string, customFieldId: string, required: boolean) {
  await withAuthorized("recruitment.manage", async (tx) => {
    await tx`update recruitment_page_questions set required = ${required}
             where recruitment_page_id = ${pageId} and custom_field_id = ${customFieldId}`;
  });
  revalidatePath(`/panel/recruitment/${pageId}`);
}

/** Creates a brand-new recruitment question (a custom_field) and attaches it to the page in one step. */
export async function createAndAttachQuestion(
  pageId: string,
  label: string,
  fieldType: string,
  optionsCsv: string,
) {
  await withAuthorized("recruitment.manage", async (tx, session) => {
    const baseKey = slugify(label) || "sporgsmaal";
    let key = baseKey;
    let n = 2;
    for (;;) {
      const [clash] = await tx`select 1 from custom_fields where org_id = ${session.orgId} and key = ${key}`;
      if (!clash) break;
      key = `${baseKey}_${n++}`;
    }
    const options = ["select", "multi_select"].includes(fieldType)
      ? optionsCsv.split(",").map((o) => o.trim()).filter(Boolean)
      : [];
    const [field] = await tx`
      insert into custom_fields (org_id, key, label, field_type, options)
      values (${session.orgId}, ${key}, ${label.trim()}, ${fieldType}, ${tx.json(options)})
      returning id`;
    const [{ next }] = await tx`
      select coalesce(max(position), -1) + 1 as next from recruitment_page_questions where recruitment_page_id = ${pageId}`;
    await tx`
      insert into recruitment_page_questions (org_id, recruitment_page_id, custom_field_id, position)
      values (${session.orgId}, ${pageId}, ${field.id}, ${next})`;
  });
  revalidatePath(`/panel/recruitment/${pageId}`);
}
