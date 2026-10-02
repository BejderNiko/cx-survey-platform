import { adminSql } from "../db";

/**
 * Anonymous recruitment flow. Like lib/data/respondent.ts, this is the ONLY
 * code path (besides that file) that uses the service connection: every
 * function validates the page's public_token and only ever touches the org
 * that token belongs to. Authenticated app code never goes through here.
 */

const NATIVE_RECRUITMENT_QUESTIONS: Record<string, { label: string; fieldType: string; options: string[] }> = {
  age: { label: "Age", fieldType: "number", options: [] },
  uddannelse: { label: "Education", fieldType: "select", options: ["Folkeskole", "Studentereksamen", "Erhvervsfaglig", "Kort videregående under 3 år", "Mellemlang videregående 3-4 år", "Lang videregående over 4 år", "Ønsker ikke at oplyse"] },
  opvarmningskilde: { label: "Heating source", fieldType: "select", options: ["Pillefyr", "Elvarme", "Varmepumpe", "Fjernvarme", "Jordvarme", "Solvarme", "Brændeovn", "Oliefyr", "Naturgas", "Bioenergi"] },
  customer_status: { label: "Customer relation", fieldType: "select", options: ["customer", "former", "prospect", "member"] },
  tag: { label: "Tags", fieldType: "select", options: [] },
};

async function hasRecruitmentSourceKey(): Promise<boolean> {
  const [row] = await adminSql`
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'recruitment_page_questions'
        and column_name = 'source_key'
    ) as available`;
  return Boolean(row?.available);
}

export interface RecruitmentQuestion {
  id: string;
  key: string;
  label: string;
  fieldType: string;
  options: string[];
  required: boolean;
  position: number;
  sourceKey: string | null;
  customFieldId: string | null;
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
  const sourceKeyAvailable = await hasRecruitmentSourceKey();
  const questions = sourceKeyAvailable ? await adminSql`
    select rpq.id as question_id, rpq.source_key, cf.id, cf.key, cf.label, cf.field_type, cf.options, rpq.required, rpq.position
    from recruitment_page_questions rpq left join custom_fields cf on cf.id = rpq.custom_field_id
    where rpq.recruitment_page_id = ${page.id}
    order by rpq.position` : await adminSql`
    select rpq.id as question_id, null::text as source_key, cf.id, cf.key, cf.label, cf.field_type, cf.options, rpq.required, rpq.position
    from recruitment_page_questions rpq join custom_fields cf on cf.id = rpq.custom_field_id
    where rpq.recruitment_page_id = ${page.id}
    order by rpq.position`;
  const tagRows = await adminSql`select name from tags where org_id = ${page.org_id} order by name`;
  const tagOptions = tagRows.map((row) => String(row.name));
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
    questions: questions.map((q) => {
      const sourceKey = q.source_key as string | null;
      const native = sourceKey ? NATIVE_RECRUITMENT_QUESTIONS[sourceKey] : undefined;
      return {
        id: q.question_id as string, key: String(sourceKey ?? q.key ?? ""), label: String(q.label ?? native?.label ?? q.key ?? "Question"),
        fieldType: String(q.field_type ?? native?.fieldType ?? "text"), options: (sourceKey === "tag" ? tagOptions : (q.options ?? native?.options ?? [])) as string[],
        required: q.required as boolean, position: q.position as number, sourceKey, customFieldId: q.id as string | null,
      };
    }),
  };
}

export interface SubmitRecruitmentInput {
  token: string;
  firstName: string;
  email: string;
  answers: Record<string, unknown>; // recruitment question id -> raw answer
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
      if (question.sourceKey === "age" && (!Number.isInteger(n) || n < 0 || n > 120)) return { ok: false, error: `'${question.label}' skal være mellem 0 og 120.` };
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

    const [{ available: sourceKeyAvailable }] = await tx`
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'recruitment_page_questions'
          and column_name = 'source_key'
      ) as available`;
    const questions = sourceKeyAvailable ? await tx`
      select rpq.id as question_id, rpq.source_key, cf.id, cf.key, cf.label, cf.field_type, cf.options, rpq.required, rpq.position
      from recruitment_page_questions rpq left join custom_fields cf on cf.id = rpq.custom_field_id
      where rpq.recruitment_page_id = ${page.id}` : await tx`
      select rpq.id as question_id, null::text as source_key, cf.id, cf.key, cf.label, cf.field_type, cf.options, rpq.required, rpq.position
      from recruitment_page_questions rpq join custom_fields cf on cf.id = rpq.custom_field_id
      where rpq.recruitment_page_id = ${page.id}`;

    const normalized: { fieldId: string | null; sourceKey: string | null; value: unknown }[] = [];
    for (const q of questions) {
      const question: RecruitmentQuestion = {
        id: q.question_id as string, key: String(q.source_key ?? q.key ?? ""), label: String(q.label ?? NATIVE_RECRUITMENT_QUESTIONS[String(q.source_key ?? "")]?.label ?? q.key ?? "Question"),
        fieldType: String(q.field_type ?? NATIVE_RECRUITMENT_QUESTIONS[String(q.source_key ?? "")]?.fieldType ?? "text"), options: (q.options ?? NATIVE_RECRUITMENT_QUESTIONS[String(q.source_key ?? "")]?.options ?? []) as string[],
        required: q.required as boolean, position: q.position as number, sourceKey: q.source_key as string | null, customFieldId: q.id as string | null,
      };
      const result = normalizeAnswer(question, input.answers[question.id]);
      if (!result.ok) return { ok: false, error: result.error };
      if (result.value !== null) normalized.push({ fieldId: question.customFieldId ?? null, sourceKey: question.sourceKey, value: result.value });
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
      if (a.sourceKey === "age") {
        await tx`update panelists set birth_year = ${new Date().getFullYear() - Number(a.value)}, updated_at = now() where id = ${panelistId}`;
      } else if (a.sourceKey === "customer_status") {
        await tx`update panelists set customer_status = ${String(a.value)}, updated_at = now() where id = ${panelistId}`;
      } else if (a.sourceKey === "tag") {
        const [tag] = await tx`insert into tags (org_id, name) values (${page.org_id}, ${String(a.value)}) on conflict (org_id, name) do update set name = excluded.name returning id`;
        await tx`insert into panelist_tags (panelist_id, tag_id, org_id) values (${panelistId}, ${tag.id}, ${page.org_id}) on conflict do nothing`;
      } else if (a.fieldId || a.sourceKey) {
        let fieldId = a.fieldId;
        if (!fieldId && a.sourceKey) {
          const native = NATIVE_RECRUITMENT_QUESTIONS[a.sourceKey];
          const [field] = await tx`insert into custom_fields (org_id, key, label, field_type, options) values (${page.org_id}, ${a.sourceKey}, ${native?.label ?? a.sourceKey}, ${native?.fieldType ?? "text"}, ${tx.json((native?.options ?? []) as never)}) on conflict (org_id, key) do update set label = excluded.label returning id`;
          fieldId = field.id as string;
        }
        if (fieldId) await tx`insert into panelist_attributes (panelist_id, field_id, org_id, value) values (${panelistId}, ${fieldId}, ${page.org_id}, ${tx.json(a.value as never)}) on conflict (panelist_id, field_id) do update set value = excluded.value, updated_at = now()`;
      }
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
