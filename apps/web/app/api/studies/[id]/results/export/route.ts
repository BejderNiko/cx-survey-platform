import { allQuestions, assertCan, instrumentDefinition } from "@ok/domain";
import { getSession } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { buildPrototypePaths, type PrototypeInteractionRow } from "@/lib/prototype-results";
import { loadLatestResultData } from "@/lib/results-data";
import { filterResponses, parseResultFiltersDetailed, type FilterableResponse } from "@/lib/results-filters";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  try { assertCan(session.role, "responses.view"); } catch { return Response.json({ error: "forbidden" }, { status: 403 }); }
  const { id } = await params;
  const parsedFilters = parseResultFiltersDetailed(new URL(request.url).searchParams.get("filters") ?? undefined);
  if (!parsedFilters.ok) return Response.json({ error: "invalid_filters", message: parsedFilters.message }, { status: 400 });
  const filters = parsedFilters.filters;
  const data = await withUser(session.userId, session.orgId, (tx) => loadLatestResultData(tx, session.orgId, id));
  if (!data) return Response.json({ error: "not_found" }, { status: 404 });
  if (!data.version) return Response.json({ error: "no_published_version" }, { status: 409 });
  const parsed = instrumentDefinition.safeParse(data.version.definition);
  if (!parsed.success) return Response.json({ error: "invalid_instrument" }, { status: 409 });
  const questions = allQuestions(parsed.data);
  const answersByResponse = new Map<string, Record<string, unknown>>();
  for (const answer of data.answers) {
    const responseId = String(answer.response_id);
    answersByResponse.set(responseId, { ...(answersByResponse.get(responseId) ?? {}), [String(answer.question_code)]: answer.value });
  }
  const interactions: PrototypeInteractionRow[] = data.interactions.map((row) => ({
    responseId: String(row.response_id), questionCode: String(row.question_code), eventType: String(row.event_type), payload: row.payload as Record<string, unknown>,
  }));
  const pathsByCode = new Map(questions.filter((question) => question.type === "prototype_test").map((question) => [question.code, buildPrototypePaths(interactions, question.code)]));
  const rows = data.responses.map((response) => {
    const responseId = String(response.id);
    const paths: Record<string, string> = {};
    for (const [code, entries] of pathsByCode) paths[code] = entries.find((entry) => entry.responseId === responseId)?.signature ?? "";
    return {
      id: responseId,
      answers: answersByResponse.get(responseId) ?? {},
      tags: (response.tags as unknown[]).map(String),
      paths,
      facets: { location: String(response.location), ageRange: String(response.age_range), source: String(response.source) },
      source: response,
    } satisfies FilterableResponse & { source: typeof response };
  });
  const filtered = filterResponses(rows, filters);
  const header = ["response_id", "respondent_key", "study_version", "started_at", "completed_at", "channel", "location", "age_range", "source", "tags", ...questions.map((question) => question.code)];
  const csvRows = filtered.map(({ answers, source }) => [
    source.id, source.respondent_key, source.version_number, source.started_at, source.completed_at, source.channel,
    source.location, source.age_range, source.source, (source.tags as unknown[]).map(String).join("|"),
    ...questions.map((question) => serializeValue(answers[question.code])),
  ]);
  const csv = [header, ...csvRows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const filename = String(data.study.title).normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "results";
  return new Response(`\uFEFF${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}-v${data.version.version_number}-filtered.csv"`,
      "cache-control": "private, no-store",
      "x-result-count": String(filtered.length),
      "x-result-version": String(data.version.version_number),
    },
  });
}

function serializeValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
