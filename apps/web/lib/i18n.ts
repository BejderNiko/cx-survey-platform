/**
 * UI chrome dictionary (Danish/English). Survey content is localized in the
 * instrument itself; this covers navigation and shared labels. Locale-aware
 * dates and numbers use Intl with the user's locale (see lib/format.ts).
 */
export type UiLocale = "da" | "en";

const dict = {
  en: {
    nav_home: "Home",
    nav_panel: "Panel",
    nav_studies: "Studies",
    nav_distributions: "Distributions",
    nav_responses: "Responses",
    nav_analytics: "Analytics",
    nav_insights: "Insights",
    nav_followup: "Follow-up",
    nav_admin: "Administration",
    sign_out: "Sign out",
    search: "Search",
  },
  da: {
    nav_home: "Hjem",
    nav_panel: "Panel",
    nav_studies: "Studier",
    nav_distributions: "Udsendelser",
    nav_responses: "Besvarelser",
    nav_analytics: "Analyse",
    nav_insights: "Indsigter",
    nav_followup: "Opfølgning",
    nav_admin: "Administration",
    sign_out: "Log ud",
    search: "Søg",
  },
} as const;

export type UiKey = keyof (typeof dict)["en"];

export function t(locale: string, key: UiKey): string {
  const l: UiLocale = locale === "da" ? "da" : "en";
  return dict[l][key] ?? dict.en[key];
}
