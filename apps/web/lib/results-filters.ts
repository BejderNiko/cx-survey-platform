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

export const MAX_RESULT_FILTERS = 64;
export const MAX_RESULT_FILTER_PAYLOAD = 16_000;
const BOUNDED_VALUE = 500;

export function resultFilterKey(filter: ResultFilter): string {
  if (filter.kind === "answer") return `answer:${filter.questionCode}:${filter.value}`;
  if (filter.kind === "path") return `path:${filter.questionCode}:${filter.signature}`;
  if (filter.kind === "respondent") return `respondent:${filter.responseId}`;
  if (filter.kind === "facet") return `facet:${filter.facet}:${filter.value}`;
  return `tag:${filter.value}`;
}

export type ResultFilterCodecError = "invalid" | "too_many" | "too_large";
export type ResultFilterParseResult =
  | { ok: true; filters: ResultFilter[] }
  | { ok: false; filters: []; error: ResultFilterCodecError; message: string };
export type ResultFilterSerializeResult =
  | { ok: true; value: string }
  | { ok: false; error: ResultFilterCodecError; message: string };

type CompactResultFilter =
  | ["a", string, string]
  | ["t", string]
  | ["p", string, string]
  | ["r", string]
  | ["f", ResultFacet, string];

export function resultFilterCodecMessage(error: ResultFilterCodecError): string {
  if (error === "too_many") return `Filtertilstanden har flere end ${MAX_RESULT_FILTERS} filtre. Fjern et filter før du tilføjer et nyt.`;
  if (error === "too_large") return `Filtertilstanden fylder mere end ${MAX_RESULT_FILTER_PAYLOAD.toLocaleString("da-DK")} tegn. Fjern et filter eller brug en kortere prototype-path.`;
  return "Filterlinket er ugyldigt eller beskadiget. Ingen eksport eller rapport er kørt.";
}

export function parseResultFiltersDetailed(raw: string | undefined): ResultFilterParseResult {
  if (!raw) return { ok: true, filters: [] };
  if (raw.length > MAX_RESULT_FILTER_PAYLOAD) return parseFailure("too_large");
  try {
    const parsed = JSON.parse(raw) as unknown;
    const entries = compactEntries(parsed) ?? legacyEntries(parsed);
    if (!entries) return parseFailure("invalid");
    if (entries.length > MAX_RESULT_FILTERS) return parseFailure("too_many");
    const filters: ResultFilter[] = [];
    const seen = new Set<string>();
    for (const entry of entries) {
      const filter = decodeResultFilter(entry);
      if (!filter) return parseFailure("invalid");
      const key = resultFilterKey(filter);
      if (seen.has(key)) return parseFailure("invalid");
      seen.add(key);
      filters.push(filter);
    }
    return { ok: true, filters };
  } catch {
    return parseFailure("invalid");
  }
}

export function parseResultFilters(raw: string | undefined): ResultFilter[] {
  const result = parseResultFiltersDetailed(raw);
  if (!result.ok) throw new Error(result.message);
  return result.filters;
}

export function trySerializeResultFilters(filters: ResultFilter[]): ResultFilterSerializeResult {
  if (filters.length > MAX_RESULT_FILTERS) return serializeFailure("too_many");
  const compact: CompactResultFilter[] = [];
  const seen = new Set<string>();
  for (const filter of filters) {
    const encoded = encodeResultFilter(filter);
    if (!encoded) return serializeFailure("invalid");
    const key = resultFilterKey(filter);
    if (seen.has(key)) return serializeFailure("invalid");
    seen.add(key);
    compact.push(encoded);
  }
  const value = JSON.stringify([1, compact]);
  if (value.length > MAX_RESULT_FILTER_PAYLOAD) return serializeFailure("too_large");
  const roundtrip = parseResultFiltersDetailed(value);
  if (!roundtrip.ok || roundtrip.filters.length !== filters.length) return serializeFailure("invalid");
  return { ok: true, value };
}

export function serializeResultFilters(filters: ResultFilter[]): string {
  const result = trySerializeResultFilters(filters);
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

function compactEntries(value: unknown): unknown[] | null {
  if (!Array.isArray(value) || value.length !== 2 || value[0] !== 1 || !Array.isArray(value[1])) return null;
  return value[1];
}

function legacyEntries(value: unknown): unknown[] | null {
  return Array.isArray(value) && value[0] !== 1 ? value : null;
}

function decodeResultFilter(entry: unknown): ResultFilter | null {
  if (Array.isArray(entry)) {
    if (entry[0] === "a" && entry.length === 3 && bounded(entry[1], 64) && bounded(entry[2])) return { kind: "answer", questionCode: entry[1], value: entry[2] };
    if (entry[0] === "t" && entry.length === 2 && bounded(entry[1])) return { kind: "tag", value: entry[1] };
    if (entry[0] === "p" && entry.length === 3 && bounded(entry[1], 64) && bounded(entry[2], 4_000)) return { kind: "path", questionCode: entry[1], signature: entry[2] };
    if (entry[0] === "r" && entry.length === 2 && bounded(entry[1], 64)) return { kind: "respondent", responseId: entry[1] };
    if (entry[0] === "f" && entry.length === 3 && RESULT_FACETS.includes(entry[1] as ResultFacet) && bounded(entry[2])) return { kind: "facet", facet: entry[1] as ResultFacet, value: entry[2] };
    return null;
  }
  if (!entry || typeof entry !== "object") return null;
  const value = entry as Record<string, unknown>;
  if (value.kind === "tag" && bounded(value.value)) return { kind: "tag", value: value.value };
  if (value.kind === "answer" && bounded(value.questionCode, 64) && bounded(value.value)) return { kind: "answer", questionCode: value.questionCode, value: value.value };
  if (value.kind === "respondent" && bounded(value.responseId, 64)) return { kind: "respondent", responseId: value.responseId };
  if (value.kind === "path" && bounded(value.questionCode, 64) && bounded(value.signature, 4_000)) return { kind: "path", questionCode: value.questionCode, signature: value.signature };
  if (value.kind === "facet" && RESULT_FACETS.includes(value.facet as ResultFacet) && bounded(value.value)) return { kind: "facet", facet: value.facet as ResultFacet, value: value.value };
  return null;
}

function encodeResultFilter(filter: ResultFilter): CompactResultFilter | null {
  if (filter.kind === "answer" && bounded(filter.questionCode, 64) && bounded(filter.value)) return ["a", filter.questionCode, filter.value];
  if (filter.kind === "tag" && bounded(filter.value)) return ["t", filter.value];
  if (filter.kind === "path" && bounded(filter.questionCode, 64) && bounded(filter.signature, 4_000)) return ["p", filter.questionCode, filter.signature];
  if (filter.kind === "respondent" && bounded(filter.responseId, 64)) return ["r", filter.responseId];
  if (filter.kind === "facet" && RESULT_FACETS.includes(filter.facet) && bounded(filter.value)) return ["f", filter.facet, filter.value];
  return null;
}

function parseFailure(error: ResultFilterCodecError): ResultFilterParseResult {
  return { ok: false, filters: [], error, message: resultFilterCodecMessage(error) };
}

function serializeFailure(error: ResultFilterCodecError): ResultFilterSerializeResult {
  return { ok: false, error, message: resultFilterCodecMessage(error) };
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
  return result;
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
