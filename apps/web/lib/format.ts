/** Locale-aware date/number formatting (da-DK / en-GB). */

function intlLocale(locale: string): string {
  return locale === "da" ? "da-DK" : "en-GB";
}

export function fmtDate(value: string | Date | null | undefined, locale = "en"): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" }).format(d);
}

export function fmtDateTime(value: string | Date | null | undefined, locale = "en"): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" }).format(d);
}

export function fmtNumber(value: number | null | undefined, locale = "en", digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: digits }).format(value);
}

export function fmtPercent(value: number | null | undefined, locale = "en", digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${fmtNumber(value, locale, digits)}%`;
}
