export type FigmaApiErrorCode =
  | "figma_scope_missing"
  | "figma_file_permission_denied"
  | "figma_token_rejected"
  | "figma_rest_forbidden"
  | "figma_file_not_found"
  | "figma_rate_limited"
  | "figma_file_unavailable";

export function classifyFigmaApiError(status: number, body: unknown): FigmaApiErrorCode {
  const message = figmaErrorMessage(body).toLowerCase();
  if (status === 404) return "figma_file_not_found";
  if (status === 429) return "figma_rate_limited";
  if (status === 401) return "figma_token_rejected";
  if (status !== 403) return "figma_file_unavailable";
  if (message.includes("scope")) return "figma_scope_missing";
  if (message.includes("token") || message.includes("auth")) return "figma_token_rejected";
  if (message.includes("permission") || message.includes("access")) return "figma_file_permission_denied";
  return "figma_rest_forbidden";
}

function figmaErrorMessage(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const record = body as Record<string, unknown>;
  for (const key of ["message", "err", "error"]) {
    if (typeof record[key] === "string") return record[key].slice(0, 500);
  }
  return "";
}
