import { allQuestions, assertCan, instrumentDefinition } from "@ok/domain";
import { getSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { buildPrototypePaths, type PrototypeInteractionRow } from "@/lib/prototype-results";
import { filterResponses, parseResultFilters, RESULT_RESPONSE_LIMIT, type FilterableResponse } from "@/lib/results-filters";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  try { assertCan(session.role, "responses.view"); } catch { return Response.json({ error: "forbidden" }, { status: 403 }); }
  const { id } = await params;
  const filters = parseResultFilters(new URL(request.url).searchParams.get("filters") ?? undefined);
  const data = await withUser(session.userId, session.orgId, async (tx) => {
    const [study] = await tx`select title, draft_definition from studies where id = ${id} and org_id = ${session.orgId}`;
    if (!study) return null;
    const [version] = await tx`select definition from study_versions where study_id = ${id} and org_id = ${session.orgId} order by version_number desc limit 1`;
    const responses = await tx`
      select r.id, r.respondent_key, r.started_at, r.completed_at, r.channel,
             coalesce((select array_agg(t.name order by t.name) from panelist_tags pt join tags t on t.id = pt.tag_id and t.org_id = pt.org_id where pt.panelist_id = r.panelist_id and pt.org_id = r.org_id), '{}') as tags
      from responses r where r.study_id = ${id} and r.org_id = ${session.orgId} and r.status = 'completed'
      order by r.started_at asc limit ${RESULT_RESPONSE_LIMIT}`;
    const answers = await tx`select ra.response_id, ra.question_code, ra.value from response_answers ra join responses r on r.id = ra.response_id and r.org_id = ra.org_id where r.study_id = ${id} and r.org_id = ${session.orgId} and r.status = 'completed'`;
    const interactions = await tx`select ie.response_id, ie.question_code, ie.event_type, ie.payload from interaction_events ie join responses r on r.id = ie.response_id and r.org_id = ie.org_id where r.study_id = ${id} and r.org_id = ${session.orgId} and r.status = 'completed' order by ie.created_at asc, ie.id asc`;
    return { study, version, responses, answers, interactions };
  });
  if (!data) return Response.json({ error: "not_found" }, { status: 404 });
  const parsed = instrumentDefinition.safeParse(data.version?.definition ?? data.study.draft_definition);
  if (!parsed.success) return Response.json({ error: "invalid_instrument" }, { status: 409 });
  const questions = allQuestions(parsed.data);
  const answersByResponse = new Map<string, Record<string, unknown>>();
  for (const answer of data.answers) {
    const responseId = String(answer.response_id);
    answersByResponse.set(responseId, { ...(answersByResponse.get(responseId) ?? {}), [String(answer.question_code)]: answer.value });
  }
  const interactions: PrototypeInteractionRow[] = data.interactions.map((row) => ({ responseId: String(row.response_id), questionCode: String(row.question_code), eventType: String(row.event_type), payload: row.payload as Record<string, unknown> }));
  const pathsByCode = new Map(questions.filter((question) => question.type === "prototype_test").map((question) => [question.code, buildPrototypePaths(interactions, question.code)]));
  const rows = data.responses.map((response) => {
    const responseId = String(response.id);
    const paths: Record<string, string> = {};
    for (const [code, entries] of pathsByCode) paths[code] = entries.find((entry) => entry.responseId === responseId)?.signature ?? "";
    return { id: responseId, answers: answersByResponse.get(responseId) ?? {}, tags: (response.tags as unknown[]).map(String), paths, source: response } satisfies FilterableResponse & { source: typeof response };
  });
  const filtered = filterResponses(rows, filters);
  const header = ["response_id", "respondent_key", "started_at", "completed_at", "channel", "tags", ...questions.map((question) => question.code)];
  const csvRows = filtered.map(({ answers, source }) => [
    source.id, source.respondent_key, source.started_at, source.completed_at, source.channel,
    (source.tags as unknown[]).map(String).join("|"),
    ...questions.map((question) => serializeValue(answers[question.code])),
  ]);
  const csv = [header, ...csvRows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const filename = String(data.study.title).normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "results";
  return new Response(`\uFEFF${csv}`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}-filtered.csv"`, "cache-control": "private, no-store" } });
}

function serializeValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
