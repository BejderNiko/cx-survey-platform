/** Maps server/database failures to safe, actionable client text. */
export function featureRequestErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = String(error.code);
    if (code === "42P01" || code === "42703" || code === "42704" || code === "23514") {
      return "Feature request storage is not available in this environment.";
    }
    if (code === "42501") {
      return "You do not have permission to change feature requests.";
    }
  }
  return "Feature request could not be saved. Try again or contact an administrator.";
}
