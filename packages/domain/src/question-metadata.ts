import type { QuestionType } from "./instrument";

export type QuestionTypeGroup = "Score" | "Valg" | "Tekst" | "Skala" | "Matrix/rangering" | "Research tests";

export interface QuestionTypeMetadata {
  type: QuestionType;
  group: QuestionTypeGroup;
  name: string;
  description: string;
  example: string;
  respondentAction: string;
  resultMeasure: string;
}

export const QUESTION_TYPE_GROUP_ORDER: QuestionTypeGroup[] = [
  "Score", "Valg", "Tekst", "Skala", "Matrix/rangering", "Research tests",
];

export const QUESTION_TYPE_METADATA: Record<QuestionType, QuestionTypeMetadata> = {
  nps: { type: "nps", group: "Score", name: "NPS", description: "Loyalitet på skalaen 0–10.", example: "Hvor sandsynligt er det, at du vil anbefale OK?", respondentAction: "Vælger ét tal fra 0 til 10.", resultMeasure: "NPS samt andele af ambassadører, passive og kritikere." },
  csat: { type: "csat", group: "Score", name: "CSAT", description: "Tilfredshed på skalaen 1–5.", example: "Hvor tilfreds er du med hjælpen?", respondentAction: "Vælger ét tal fra 1 til 5.", resultMeasure: "Andel tilfredse samt gennemsnit." },
  ces: { type: "ces", group: "Score", name: "CES", description: "Oplevet indsats på skalaen 1–7.", example: "Hvor let var det at løse din opgave?", respondentAction: "Vælger ét tal fra 1 til 7.", resultMeasure: "Gennemsnitlig indsats og andel med lav indsats." },
  single_choice: { type: "single_choice", group: "Valg", name: "Ét valg", description: "Præcis én mulighed.", example: "Hvilken kanal brugte du?", respondentAction: "Vælger én svarmulighed.", resultMeasure: "Antal og andel pr. mulighed." },
  multiple_choice: { type: "multiple_choice", group: "Valg", name: "Flere valg", description: "En eller flere muligheder.", example: "Hvilke funktioner brugte du?", respondentAction: "Vælger alle relevante muligheder.", resultMeasure: "Antal valg pr. mulighed." },
  dropdown: { type: "dropdown", group: "Valg", name: "Rullemenu", description: "Ét valg i kompakt liste.", example: "Vælg din kommune.", respondentAction: "Åbner listen og vælger én mulighed.", resultMeasure: "Antal og andel pr. mulighed." },
  consent: { type: "consent", group: "Valg", name: "Samtykke", description: "Tydeligt ja eller nej.", example: "Må vi kontakte dig om opfølgning?", respondentAction: "Vælger ja eller nej.", resultMeasure: "Antal ja og nej." },
  short_text: { type: "short_text", group: "Tekst", name: "Kort tekst", description: "Kort fritekstsvar.", example: "Hvad var vigtigst for dig?", respondentAction: "Skriver op til 500 tegn.", resultMeasure: "Fritekst til kvalitativ analyse." },
  long_text: { type: "long_text", group: "Tekst", name: "Lang tekst", description: "Uddybende fritekstsvar.", example: "Fortæl om din oplevelse.", respondentAction: "Skriver et længere svar.", resultMeasure: "Uddybende fritekst til kodning og temaer." },
  number: { type: "number", group: "Tekst", name: "Tal", description: "Et numerisk svar.", example: "Hvor mange gange har du kontaktet os?", respondentAction: "Indtaster et tal.", resultMeasure: "Fordeling, gennemsnit og median." },
  date: { type: "date", group: "Tekst", name: "Dato", description: "En kalenderdato.", example: "Hvornår skete hændelsen?", respondentAction: "Vælger en gyldig dato.", resultMeasure: "Datoer og tidsfordeling." },
  rating: { type: "rating", group: "Skala", name: "Bedømmelse", description: "Fleksibel numerisk skala.", example: "Bedøm oplevelsen fra 1 til 5.", respondentAction: "Vælger ét trin på skalaen.", resultMeasure: "Fordeling, gennemsnit og median." },
  likert: { type: "likert", group: "Skala", name: "Likert", description: "Grad af enighed eller vurdering.", example: "Jeg kunne nemt finde det, jeg søgte.", respondentAction: "Vælger ét mærket skalatrin.", resultMeasure: "Fordeling og gennemsnitlig skalaværdi." },
  matrix: { type: "matrix", group: "Matrix/rangering", name: "Matrix", description: "Samme skala på flere udsagn.", example: "Bedøm pris, service og kvalitet.", respondentAction: "Vælger ét svar i hver række.", resultMeasure: "Fordeling og gennemsnit pr. række." },
  ranking: { type: "ranking", group: "Matrix/rangering", name: "Rangering", description: "Prioriterer alle muligheder.", example: "Rangér forbedringer efter betydning.", respondentAction: "Flytter muligheder til ønsket rækkefølge.", resultMeasure: "Placering og gennemsnitlig rang." },
  first_click: { type: "first_click", group: "Research tests", name: "Første klik", description: "Måler første klik på et billede.", example: "Hvor ville du klikke for at betale?", respondentAction: "Klikker ét sted på billedet.", resultMeasure: "Klikposition, klikfordeling og tid til klik." },
  preference_test: { type: "preference_test", group: "Research tests", name: "Præferencetest", description: "Sammenligner 2–8 billeder.", example: "Hvilket design foretrækker du?", respondentAction: "Vælger præcis ét billede.", resultMeasure: "Valg og andel pr. billede." },
};

export function groupedQuestionTypes(): { group: QuestionTypeGroup; items: QuestionTypeMetadata[] }[] {
  return QUESTION_TYPE_GROUP_ORDER.map((group) => ({
    group,
    items: Object.values(QUESTION_TYPE_METADATA).filter((item) => item.group === group),
  }));
}
