/**
 * Danske labels og farvetoner for databasens enum-værdier. Værdierne i
 * databasen er uændrede (engelske koder); alt hvad brugeren ser, oversættes
 * her. `label()` falder tilbage til rå værdi, så nye koder aldrig vælter UI.
 */

export function label(map: Record<string, string>, value: string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return map[value] ?? value;
}

export const STUDY_STATUS: Record<string, string> = {
  draft: "Kladde",
  review: "Til gennemsyn",
  scheduled: "Planlagt",
  live: "Indsamler",
  paused: "På pause",
  closed: "Afsluttet",
  archived: "Arkiveret",
};

export const STUDY_STATUS_TONE: Record<string, string> = {
  draft: "gray",
  review: "blue",
  scheduled: "blue",
  live: "green",
  paused: "amber",
  closed: "amber",
  archived: "gray",
};

export const STUDY_TYPE: Record<string, string> = {
  survey: "Spørgeskema",
  ux_test: "UX-test",
  interview: "Interview",
};

export const RESPONSE_STATUS: Record<string, string> = {
  completed: "Gennemført",
  started: "Påbegyndt",
  disqualified: "Frasorteret",
  abandoned: "Afbrudt",
};

export const CHANNEL: Record<string, string> = {
  link: "Link",
  email: "E-mail",
  qr: "QR-kode",
  trigger: "Trigger",
};

export const LIFECYCLE: Record<string, string> = {
  active: "Aktiv",
  invited: "Inviteret",
  paused: "På pause",
  unsubscribed: "Afmeldt",
  bounced: "Bounce",
  blocked: "Blokeret",
  anonymized: "Anonymiseret",
  archived: "Arkiveret",
};

export const CUSTOMER_STATUS: Record<string, string> = {
  customer: "Kunde",
  former: "Tidligere kunde",
  prospect: "Emne",
};

export const DISTRIBUTION_KIND: Record<string, string> = {
  public_link: "Offentligt link",
  panel_invite: "Panelinvitation",
};

export const INVITATION_STATUS: Record<string, string> = {
  queued: "I kø",
  sent: "Sendt",
  opened: "Åbnet",
  clicked: "Klikket",
  started: "Påbegyndt",
  completed: "Gennemført",
  bounced: "Bounce",
  unsubscribed: "Afmeldt",
  failed: "Fejlet",
};

export const OUTBOX_STATUS: Record<string, string> = {
  queued: "I kø",
  simulated: "Simuleret",
  sent: "Sendt",
  failed: "Fejlet",
};

export const RUN_STATUS: Record<string, string> = {
  succeeded: "Fuldført",
  failed: "Fejlet",
  running: "Kører",
  queued: "I kø",
};


export const ROLE_LABEL: Record<string, string> = {
  owner: "Ejer",
  administrator: "Administrator",
  researcher: "Researcher",
  panel_manager: "Panelansvarlig",
  analyst: "Analytiker",
  viewer: "Læser",
};

export const CONTACT_EVENT: Record<string, string> = {
  sent: "Sendt",
  opened: "Åbnet",
  clicked: "Klikket",
  responded: "Besvaret",
  bounced: "Bounce",
  unsubscribed: "Afmeldt",
};

export const CONSENT_STATUS: Record<string, string> = {
  granted: "Givet",
  withdrawn: "Trukket tilbage",
  expired: "Udløbet",
};

export const IMPORT_STATUS: Record<string, string> = {
  parsed: "Indlæst",
  dry_run: "Prøvekørsel",
  committed: "Gennemført",
  failed: "Fejlet",
};

export const QUESTION_TYPE: Record<string, string> = {
  nps: "NPS",
  csat: "CSAT",
  ces: "CES",
  rating: "Skala",
  likert: "Likert",
  single_choice: "Enkeltvalg",
  multiple_choice: "Flervalg",
  dropdown: "Dropdown",
  short_text: "Kort tekst",
  long_text: "Lang tekst",
  number: "Tal",
  date: "Dato",
  consent: "Samtykke",
  ranking: "Rangering",
  matrix: "Matrix",
  first_click: "Første klik",
  preference_test: "Præferencetest",
};

export const VAR_TYPE: Record<string, string> = {
  numeric: "Numerisk",
  string: "Tekst",
  date: "Dato",
};

export const MEASURE: Record<string, string> = {
  nominal: "Nominal",
  ordinal: "Ordinal",
  scale: "Skala",
};

export const CUSTOM_FIELD_TYPE: Record<string, string> = {
  text: "Tekst",
  number: "Tal",
  boolean: "Ja/nej",
  select: "Liste (vælg én)",
  multi_select: "Liste (vælg flere)",
  date: "Dato",
};

export const LOGO_POSITION: Record<string, string> = {
  left: "Venstre",
  center: "Centreret",
  right: "Højre",
};
