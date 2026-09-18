/** Hosted schema can lag application code. Never expose database error text. */
export function recruitmentSchemaMessage(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = String(error.code);
  if (code === "42P01" || code === "42703" || code === "42704" || code === "23514") {
    return "Rekruttering er ikke klar i dette miljø endnu. Kontakt en administrator for schema-status.";
  }
  return null;
}
