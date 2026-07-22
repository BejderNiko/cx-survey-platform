/**
 * UI-tekster. Platformen er kun på dansk — al UI-krom lever her eller direkte
 * i komponenterne. Undersøgelsesindhold (spørgsmål m.m.) lokaliseres fortsat i
 * selve instrumentet, som kan have danske og engelske varianter til
 * respondenter. Datoer og tal formateres da-DK (se lib/format.ts).
 */
const dict = {
  nav_home: "Hjem",
  nav_panel: "Panel",
  nav_studies: "Studier",
  nav_analytics: "Analyse",
  nav_insights: "Indsigter",
  nav_admin: "Administration",
  sign_out: "Log ud",
  search: "Søg",
} as const;

export type UiKey = keyof typeof dict;

export function t(key: UiKey): string {
  return dict[key];
}
