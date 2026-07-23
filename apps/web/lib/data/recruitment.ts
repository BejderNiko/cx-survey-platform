import { adminSql } from "../db";

/**
 * Anonymous recruitment flow. Like lib/data/respondent.ts, this is the ONLY
 * code path (besides that file) that uses the service connection: every
 * function validates the page's public_token and only ever touches the org
 * that token belongs to. Authenticated app code never goes through here.
 */

export interface RecruitmentQuestion {
  id: string;
  key: string;
  label: string;
  fieldType: string;
  options: string[];
  required: boolean;
  position: number;
}

export interface PublicRecruitmentPage {
  id: string;
  orgId: string;
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
  screeningEnabled: boolean;
  screeningQuestionContent: string;
  screeningContinueLabel: string;
  screeningEndLabel: string;
  screeningEndContent: string;
  questions: RecruitmentQuestion[];
}

export async function getRecruitmentPage(token: string): Promise<PublicRecruitmentPage | null> {
  const [page] = await adminSql`
    select id, org_id, public_token, language, background_color, some_thumbnail_url,
           page_title, page_content, header_image_url, background_image_url, header_logo_position,
           thank_you_content, screening_enabled, screening_question_content,
           screening_continue_label, screening_end_label, screening_end_content
    from recruitment_pages where public_token = ${token} and is_active`;
  if (!page) return null;
  const questions = await adminSql`
    select cf.id, cf.key, cf.label, cf.field_type, cf.options, rpq.required, rpq.position
    from recruitment_page_questions rpq join custom_fields cf on cf.id = rpq.custom_field_id
    where rpq.recruitment_page_id = ${page.id}
    order by rpq.position`;
  return {
    id: page.id as string,
    orgId: page.org_id as string,
    publicToken: page.public_token as string,
    language: page.language as string,
    backgroundColor: page.background_color as string,
    someThumbnailUrl: page.some_thumbnail_url as string | null,
    pageTitle: page.page_title as string,
    pageContent: page.page_content as string,
    headerImageUrl: page.header_image_url as string | null,
    backgroundImageUrl: page.background_image_url as string | null,
    headerLogoPosition: page.header_logo_position as string,
    thankYouContent: page.thank_you_content as string,
    screeningEnabled: page.screening_enabled as boolean,
    screeningQuestionContent: page.screening_question_content as string,
    screeningContinueLabel: page.screening_continue_label as string,
    screeningEndLabel: page.screening_end_label as string,
    screeningEndContent: page.screening_end_content as string,
    questions: questions.map((q) => ({
      id: q.id as string,
      key: q.key as string,
      label: q.label as string,
      fieldType: q.field_type as string,
      options: (q.options ?? []) as string[],
      required: q.required as boolean,
      position: q.position as number,
    })),
  };
}

export interface SubmitRecruitmentInput {
  token: string;
  firstName: string;
  email: string;
  answers: Record<string, unknown>; // custom_field id -> raw answer
}

function normalizeAnswer(
  question: RecruitmentQuestion,
  raw: unknown,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const missing = raw === undefined || raw === null || raw === "" || (Array.isArray(raw) && raw.length === 0);
  if (missing) {
    return question.required
      ? { ok: false, error: `'${question.label}' skal udfyldes.` }
      : { ok: true, value: null };
  }
  switch (question.fieldType) {
    case "number": {
      const n = Number(raw);
      if (!Number.isFinite(n)) return { ok: false, error: `'${question.label}' skal være et tal.` };
      return { ok: true, value: n };
    }
    case "boolean":
      return { ok: true, value: raw === true || raw === "true" };
    case "select": {
      const v = String(raw);
      if (!question.options.includes(v)) return { ok: false, error: `'${question.label}' har en ugyldig værdi.` };
      return { ok: true, value: v };
    }
    case "multi_select": {
      const arr = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      if (!arr.every((v) => question.options.includes(v))) {
        return { ok: false, error: `'${question.label}' har en ugyldig værdi.` };
      }
      return { ok: true, value: arr };
    }
    default:
      return { ok: true, value: String(raw) };
  }
}

/**
 * Validates the screening gate + answers, then upserts a panelist by email
 * within the page's org (self-service, so "most recent submission wins" for
 * the name and attribute values), grants panel_membership/survey_contact
 * consent, and queues the confirmation message in the simulated outbox.
 * Anonymized panelists can never be matched here: anonymization clears
 * email to null, so there is nothing for a public submission to rejoin.
 */
export async function submitRecruitment(
  input: SubmitRecruitmentInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const firstName = input.firstName.trim();
  const email = input.email.trim().toLowerCase();
  if (!firstName) return { ok: false, error: "Navn skal udfyldes." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Ugyldig e-mailadresse." };

  return adminSql.begin(async (tx) => {
    const [page] = await tx`
      select id, org_id, public_token, confirmation_email_title, confirmation_email_content
      from recruitment_pages where public_token = ${input.token} and is_active
      for update`;
    if (!page) return { ok: false, error: "unknown_token" };

    const questions = await tx`
      select cf.id, cf.key, cf.label, cf.field_type, cf.options, rpq.required, rpq.position
      from recruitment_page_questions rpq join custom_fields cf on cf.id = rpq.custom_field_id
      where rpq.recruitment_page_id = ${page.id}`;

    const normalized: { fieldId: string; value: unknown }[] = [];
    for (const q of questions) {
      const question: RecruitmentQuestion = {
        id: q.id as string, key: q.key as string, label: q.label as string,
        fieldType: q.field_type as string, options: (q.options ?? []) as string[],
        required: q.required as boolean, position: q.position as number,
      };
      const result = normalizeAnswer(question, input.answers[question.id]);
      if (!result.ok) return { ok: false, error: result.error };
      if (result.value !== null) normalized.push({ fieldId: question.id, value: result.value });
    }

    const [existing] = await tx`select id from panelists where org_id = ${page.org_id} and email = ${email}`;
    let panelistId: string;
    if (existing) {
      panelistId = existing.id as string;
      await tx`update panelists set first_name = ${firstName}, updated_at = now() where id = ${panelistId}`;
    } else {
      const [created] = await tx`
        insert into panelists (org_id, first_name, email, language, recruitment_source, lifecycle)
        values (${page.org_id}, ${firstName}, ${email}, 'da', ${"recruitment:" + (page.public_token as string)}, 'active')
        returning id`;
      panelistId = created.id as string;
    }

    for (const purpose of ["panel_membership", "survey_contact"] as const) {
      const [granted] = await tx`
        select id from consent_records
        where panelist_id = ${panelistId} and purpose = ${purpose} and status = 'granted'`;
      if (!granted) {
        await tx`insert into consent_records (org_id, panelist_id, purpose, status, source, granted_at)
                 values (${page.org_id}, ${panelistId}, ${purpose}, 'granted',
                         ${"recruitment:" + (page.public_token as string)}, now())`;
      }
    }

    for (const a of normalized) {
      await tx`insert into panelist_attributes (panelist_id, field_id, org_id, value)
               values (${panelistId}, ${a.fieldId}, ${page.org_id}, ${tx.json(a.value as never)})
               on conflict (panelist_id, field_id) do update set value = excluded.value, updated_at = now()`;
    }

    await tx`insert into recruitment_submissions (org_id, recruitment_page_id, panelist_id)
             values (${page.org_id}, ${page.id}, ${panelistId})`;

    if (page.confirmation_email_title || page.confirmation_email_content) {
      await tx`insert into outbox_messages (org_id, channel, to_address, subject, body)
               values (${page.org_id}, 'email', ${email},
                       ${(page.confirmation_email_title as string) || "Velkommen"},
                       ${(page.confirmation_email_content as string) || ""})`;
    }

    return { ok: true };
  }) as Promise<{ ok: true } | { ok: false; error: string }>;
}
