import { allQuestions, lt, type InstrumentDefinition, type Question } from "@ok/domain";

export const RESULT_FACETS = ["location", "ageRange", "source"] as const;
export type ResultFacet = (typeof RESULT_FACETS)[number];

export type ResultFilter =
  | { kind: "answer"; questionCode: string; value: string }
  | { kind: "tag"; value: string }
  | { kind: "path"; questionCode: string; signature: string }
  | { kind: "respondent"; responseId: string }
  | { kind: "facet"; facet: ResultFacet; value: string };

export interface FilterableResponse {
  id: string;
  answers: Record<string, unknown>;
  tags: string[];
  paths: Record<string, string>;
  facets: Record<ResultFacet, string>;
}

export const RESULT_RESPONSE_LIMIT = 50_000;

const MAX_FILTERS = 20;
const MAX_SERIALIZED_LENGTH = 8_000;
const BOUNDED_VALUE = 500;

export function resultFilterKey(filter: ResultFilter): string {
  if (filter.kind === "answer") return `answer:${filter.questionCode}:${filter.value}`;
  if (filter.kind === "path") return `path:${filter.questionCode}:${filter.signature}`;
  if (filter.kind === "respondent") return `respondent:${filter.responseId}`;
  if (filter.kind === "facet") return `facet:${filter.facet}:${filter.value}`;
  return `tag:${filter.value}`;
}

export function parseResultFilters(raw: string | undefined): ResultFilter[] {
  if (!raw || raw.length > MAX_SERIALIZED_LENGTH) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const result: ResultFilter[] = [];
    const seen = new Set<string>();
    for (const entry of parsed.slice(0, MAX_FILTERS)) {
      if (!entry || typeof entry !== "object") continue;
      const value = entry as Record<string, unknown>;
      const kind = value.kind;
      let filter: ResultFilter | null = null;
      if (kind === "tag" && bounded(value.value)) filter = { kind, value: value.value };
      if (kind === "answer" && bounded(value.questionCode, 64) && bounded(value.value)) {
        filter = { kind, questionCode: value.questionCode, value: value.value };
      }
      if (kind === "respondent" && bounded(value.responseId, 64)) filter = { kind, responseId: value.responseId };
      if (kind === "path" && bounded(value.questionCode, 64) && bounded(value.signature, 4_000)) {
        filter = { kind, questionCode: value.questionCode, signature: value.signature };
      }
      if (kind === "facet" && RESULT_FACETS.includes(value.facet as ResultFacet) && bounded(value.value)) {
        filter = { kind, facet: value.facet as ResultFacet, value: value.value };
      }
      if (filter && !seen.has(resultFilterKey(filter))) {
        result.push(filter);
        seen.add(resultFilterKey(filter));
      }
    }
    return result;
  } catch {
    return [];
  }
}

export function serializeResultFilters(filters: ResultFilter[]): string {
  return JSON.stringify(filters.slice(0, MAX_FILTERS));
}

export function responseMatchesFilter(response: FilterableResponse, filter: ResultFilter): boolean {
  if (filter.kind === "tag") return response.tags.includes(filter.value);
  if (filter.kind === "path") return response.paths[filter.questionCode] === filter.signature;
  if (filter.kind === "respondent") return response.id === filter.responseId;
  if (filter.kind === "facet") return response.facets[filter.facet] === filter.value;
  const answer = response.answers[filter.questionCode];
  if (Array.isArray(answer)) return answer.some((value) => String(value) === filter.value);
  if (answer && typeof answer === "object") {
    const record = answer as Record<string, unknown>;
    return [record.selectedId, record.selectedAssetId, record.reachedGoal, record.lastFrameId]
      .some((value) => String(value) === filter.value);
  }
  return String(answer) === filter.value;
}

export function filterResponses<T extends FilterableResponse>(responses: T[], filters: ResultFilter[]): T[] {
  return responses.filter((response) => filters.every((filter) => responseMatchesFilter(response, filter)));
}

export function pathSignature(frameIds: string[]): string {
  return frameIds.filter(Boolean).join("→");
}

export function resultFilterLabel(filter: ResultFilter, definition: InstrumentDefinition): string {
  if (filter.kind === "tag") return `Tag: ${filter.value}`;
  if (filter.kind === "facet") return `${facetLabel(filter.facet)}: ${filter.value}`;
  if (filter.kind === "respondent") return `Respondent: ${filter.responseId.slice(0, 8)}…`;
  const question = allQuestions(definition).find((item) => item.code === filter.questionCode);
  if (filter.kind === "path") return `${questionLabel(question)}: ${filter.signature || "Tom sti"}`;
  const option = question?.options?.find((item) => String(item.value ?? item.id) === filter.value);
  return `${questionLabel(question)}: ${option ? lt(option.label, definition.defaultLanguage) : filter.value}`;
}

export function facetLabel(facet: ResultFacet): string {
  if (facet === "location") return "Location";
  if (facet === "ageRange") return "Aldersgruppe";
  return "Kilde";
}

export function facetCounts<T extends FilterableResponse>(
  responses: T[], filters: ResultFilter[], facet: ResultFacet,
): { value: string; matching: number; total: number; active: boolean }[] {
  const otherFilters = filters.filter((filter) => filter.kind !== "facet" || filter.facet !== facet);
  const values = [...new Set(responses.map((response) => response.facets[facet]).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "da"));
  return values.map((value) => {
    const candidate: ResultFilter = { kind: "facet", facet, value };
    return {
      value,
      matching: filterResponses(responses, [...otherFilters, candidate]).length,
      total: responses.length,
      active: filters.some((filter) => resultFilterKey(filter) === resultFilterKey(candidate)),
    };
  });
}

export function tagFacetCounts<T extends FilterableResponse>(
  responses: T[], filters: ResultFilter[],
): { value: string; matching: number; total: number; active: boolean }[] {
  const values = [...new Set(responses.flatMap((response) => response.tags))].sort((a, b) => a.localeCompare(b, "da"));
  return values.map((value) => {
    const candidate: ResultFilter = { kind: "tag", value };
    const candidateFilters = filters.some((filter) => resultFilterKey(filter) === resultFilterKey(candidate)) ? filters : [...filters, candidate];
    return {
      value,
      matching: filterResponses(responses, candidateFilters).length,
      total: responses.length,
      active: filters.some((filter) => resultFilterKey(filter) === resultFilterKey(candidate)),
    };
  });
}

export function mergeResultFilters(existing: ResultFilter[], additions: ResultFilter[]): ResultFilter[] {
  let result = [...existing];
  for (const filter of additions) {
    if (filter.kind === "facet") result = result.filter((item) => item.kind !== "facet" || item.facet !== filter.facet);
    if (!result.some((item) => resultFilterKey(item) === resultFilterKey(filter))) result.push(filter);
  }
  return result.slice(0, MAX_FILTERS);
}

export function draftFiltersFromNaturalLanguage(
  input: string,
  definition: InstrumentDefinition,
): { filters: ResultFilter[]; explanation: string; provenance: string } {
  const text = input.trim();
  const provenance = "Lokal regelparser; ingen svardata eller hemmeligheder sendt ud af platformen.";
  if (!text || text.length > 500) return { filters: [], explanation: "Skriv et kort filterønske på højst 500 tegn.", provenance };

  const facetMatch = text.match(/^(location|lokation|aldersgruppe|alder|kilde|source|kanal)\s*(?:=|er|is)\s*(.+)$/iu);
  if (facetMatch?.[2]?.trim()) {
    const facet: ResultFacet = /alder/iu.test(facetMatch[1]) ? "ageRange" : /location|lokation/iu.test(facetMatch[1]) ? "location" : "source";
    return { filters: [{ kind: "facet", facet, value: facetMatch[2].trim() }], explanation: `Udkast: ${facetLabel(facet)} er ${facetMatch[2].trim()}.`, provenance };
  }
  const tagMatch = text.match(/^tag\s*(?:=|er|is)\s*(.+)$/iu);
  if (tagMatch?.[1]?.trim()) return { filters: [{ kind: "tag", value: tagMatch[1].trim() }], explanation: `Udkast: paneltag er ${tagMatch[1].trim()}.`, provenance };

  const answerMatch = text.match(/^(?:svar|answer)?\s*([^=]+?)\s*(?:=|\ber\b|\bis\b)\s*(.+)$/iu);
  if (!answerMatch) return { filters: [], explanation: "Kunne ikke fortolke ønsket. Brug fx ‘nps = 10’, ‘kilde = email’ eller ‘tag = Elbil’.", provenance };
  const questionNeedle = normalize(answerMatch[1]);
  const valueNeedle = normalize(answerMatch[2]);
  const question = allQuestions(definition).find((item) => {
    const label = normalize(lt(item.label, definition.defaultLanguage));
    return normalize(item.code) === questionNeedle || label === questionNeedle || label.includes(questionNeedle);
  });
  if (!question) return { filters: [], explanation: `Intet spørgsmål matcher ‘${answerMatch[1].trim()}’.`, provenance };
  const option = question.options?.find((item) => {
    const label = normalize(lt(item.label, definition.defaultLanguage));
    return normalize(String(item.value ?? item.id)) === valueNeedle || label === valueNeedle;
  });
  const value = option ? String(option.value ?? option.id) : answerMatch[2].trim();
  return { filters: [{ kind: "answer", questionCode: question.code, value }], explanation: `Udkast: ${questionLabel(question)} er ${option ? lt(option.label, definition.defaultLanguage) : value}.`, provenance };
}

function questionLabel(question: Question | undefined): string {
  return question ? (lt(question.label, "da") || question.code) : "Ukendt spørgsmål";
}

function bounded(value: unknown, max = BOUNDED_VALUE): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("da");
}
