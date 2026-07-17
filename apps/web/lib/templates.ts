import type { InstrumentDefinitionInput } from "@ok/domain";

/**
 * Built-in study templates (org_id null in the templates table). All content
 * is original OK wording with Danish and English variants.
 */

export interface BuiltInTemplate {
  key: string;
  name: string;
  category: string;
  description: string;
  definition: InstrumentDefinitionInput;
}

const base = {
  languages: ["da", "en"] as ("da" | "en")[],
  defaultLanguage: "da" as const,
};

const npsCore = (context: { da: string; en: string }) => ({
  code: "nps_score",
  type: "nps" as const,
  label: {
    da: `Hvor sandsynligt er det, at du vil anbefale ${context.da} til familie eller kolleger? (0-10)`,
    en: `How likely are you to recommend ${context.en} to family or colleagues? (0-10)`,
  },
  required: true,
});

const mainReason = {
  code: "main_reason",
  type: "single_choice" as const,
  label: { da: "Hvad er den vigtigste årsag til din vurdering?", en: "What is the main reason for your rating?" },
  options: [
    { id: "price", label: { da: "Pris", en: "Price" } },
    { id: "service", label: { da: "Service og betjening", en: "Service" } },
    { id: "quality", label: { da: "Kvalitet af produktet", en: "Product quality" } },
    { id: "digital", label: { da: "App og selvbetjening", en: "App and self-service" } },
    { id: "availability", label: { da: "Tilgængelighed", en: "Availability" } },
    { id: "other", label: { da: "Andet", en: "Other" } },
  ],
};

const detractorWhy = {
  code: "improve_text",
  type: "long_text" as const,
  label: { da: "Hvad kan vi gøre bedre?", en: "What could we do better?" },
  visibleIf: [{ questionCode: "nps_score", op: "lte" as const, value: 8 }],
};

const promoterWhy = {
  code: "praise_text",
  type: "long_text" as const,
  label: { da: "Hvad sætter du mest pris på?", en: "What do you value the most?" },
  visibleIf: [{ questionCode: "nps_score", op: "gte" as const, value: 9 }],
};

const contactConsent = {
  code: "contact_ok",
  type: "consent" as const,
  label: {
    da: "Må vi kontakte dig om din besvarelse?",
    en: "May we contact you about your answers?",
  },
};

const messages = {
  intro: {
    da: "Tak fordi du vil hjælpe os. Undersøgelsen tager 1-2 minutter.",
    en: "Thank you for helping us. The survey takes 1-2 minutes.",
  },
  thankYou: {
    da: "Tak for din besvarelse. Din feedback gør en forskel.",
    en: "Thank you for your response. Your feedback makes a difference.",
  },
  disqualified: {
    da: "Tak for din interesse. Denne undersøgelse er ikke relevant for dig denne gang.",
    en: "Thank you for your interest. This survey is not relevant for you this time.",
  },
  closed: {
    da: "Undersøgelsen er lukket for besvarelser.",
    en: "This survey is closed for responses.",
  },
};

export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  {
    key: "relational_nps",
    name: "Relationel NPS / Relational NPS",
    category: "relational_nps",
    description:
      "Årlig eller halvårlig loyalitetsmåling med NPS, hovedårsag og åbne opfølgninger. / Annual or semi-annual loyalty measurement with NPS, main reason, and open follow-ups.",
    definition: {
      ...base,
      blocks: [
        {
          id: "b1",
          questions: [npsCore({ da: "OK", en: "OK" }), mainReason, detractorWhy, promoterWhy, contactConsent],
        },
      ],
      messages,
    },
  },
  {
    key: "transactional_nps",
    name: "Transaktionel NPS / Transactional NPS",
    category: "transactional_nps",
    description:
      "Måling efter en konkret interaktion (køb, support, levering). / Measurement after a specific interaction (purchase, support, delivery).",
    definition: {
      ...base,
      blocks: [
        {
          id: "b1",
          questions: [
            npsCore({ da: "OK efter din seneste henvendelse", en: "OK after your recent interaction" }),
            {
              code: "interaction_rating",
              type: "csat",
              label: {
                da: "Hvor tilfreds var du med selve henvendelsen? (1-5)",
                en: "How satisfied were you with the interaction itself? (1-5)",
              },
            },
            detractorWhy,
            contactConsent,
          ],
        },
      ],
      messages,
    },
  },
  {
    key: "csat",
    name: "Kundetilfredshed (CSAT) / Customer satisfaction (CSAT)",
    category: "csat",
    description: "Kort tilfredshedsmåling på 1-5 skala med åben opfølgning. / Short satisfaction measurement on a 1-5 scale with open follow-up.",
    definition: {
      ...base,
      blocks: [
        {
          id: "b1",
          questions: [
            {
              code: "csat_score",
              type: "csat",
              label: { da: "Hvor tilfreds er du samlet set? (1-5)", en: "Overall, how satisfied are you? (1-5)" },
              required: true,
            },
            {
              code: "csat_why",
              type: "long_text",
              label: { da: "Hvad er den vigtigste grund til din vurdering?", en: "What is the main reason for your rating?" },
            },
          ],
        },
      ],
      messages,
    },
  },
  {
    key: "ces",
    name: "Customer Effort Score (CES)",
    category: "ces",
    description: "Hvor let var det at få løst opgaven (1-7). / How easy was it to get the task done (1-7).",
    definition: {
      ...base,
      blocks: [
        {
          id: "b1",
          questions: [
            {
              code: "ces_score",
              type: "ces",
              label: {
                da: "Hvor let var det at få løst din henvendelse? (1 = meget svært, 7 = meget let)",
                en: "How easy was it to resolve your request? (1 = very difficult, 7 = very easy)",
              },
              required: true,
            },
            {
              code: "ces_friction",
              type: "long_text",
              label: { da: "Hvad gjorde det svært?", en: "What made it difficult?" },
              visibleIf: [{ questionCode: "ces_score", op: "lte", value: 4 }],
            },
          ],
        },
      ],
      messages,
    },
  },
  {
    key: "onboarding",
    name: "Onboarding-feedback / Onboarding feedback",
    category: "onboarding",
    description: "Feedback fra nye kunder efter de første 30 dage. / Feedback from new customers after the first 30 days.",
    definition: {
      ...base,
      blocks: [
        {
          id: "b1",
          questions: [
            {
              code: "onboarding_ease",
              type: "rating",
              label: { da: "Hvor nem var opstarten? (1-5)", en: "How easy was getting started? (1-5)" },
              scale: { min: 1, max: 5, minLabel: { da: "Meget svær", en: "Very hard" }, maxLabel: { da: "Meget nem", en: "Very easy" } },
              required: true,
            },
            {
              code: "onboarding_missing",
              type: "multiple_choice",
              label: { da: "Hvad manglede du i opstarten?", en: "What did you miss during onboarding?" },
              options: [
                { id: "guides", label: { da: "Bedre vejledninger", en: "Better guides" } },
                { id: "contact", label: { da: "Personlig kontakt", en: "Personal contact" } },
                { id: "pricing", label: { da: "Klarhed om priser", en: "Clarity about prices" } },
                { id: "nothing", label: { da: "Ingenting", en: "Nothing" } },
              ],
            },
            { code: "onboarding_open", type: "long_text", label: { da: "Andet vi bør vide?", en: "Anything else we should know?" } },
          ],
        },
      ],
      messages,
    },
  },
  {
    key: "service_recovery",
    name: "Service recovery",
    category: "service_recovery",
    description: "Opfølgning efter en klage eller dårlig oplevelse. / Follow-up after a complaint or a bad experience.",
    definition: {
      ...base,
      blocks: [
        {
          id: "b1",
          questions: [
            {
              code: "resolved",
              type: "single_choice",
              label: { da: "Blev din sag løst?", en: "Was your issue resolved?" },
              required: true,
              options: [
                { id: "yes", label: { da: "Ja, fuldt ud", en: "Yes, fully" } },
                { id: "partly", label: { da: "Delvist", en: "Partly" } },
                { id: "no", label: { da: "Nej", en: "No" } },
              ],
              branches: [{ id: "br1", when: [{ questionCode: "resolved", op: "eq", value: "yes" }], goTo: "recovery_nps" }],
            },
            {
              code: "unresolved_detail",
              type: "long_text",
              label: { da: "Hvad mangler der stadig?", en: "What is still missing?" },
            },
            { ...npsCore({ da: "OK efter forløbet", en: "OK after this experience" }), code: "recovery_nps" },
          ],
        },
      ],
      messages,
    },
  },
  {
    key: "churn",
    name: "Churn-undersøgelse / Churn survey",
    category: "churn",
    description: "Forstå hvorfor kunder opsiger. / Understand why customers cancel.",
    definition: {
      ...base,
      blocks: [
        {
          id: "b1",
          questions: [
            {
              code: "churn_reason",
              type: "single_choice",
              label: { da: "Hvad var den vigtigste grund til, at du opsagde?", en: "What was the main reason you cancelled?" },
              required: true,
              options: [
                { id: "price", label: { da: "Prisen", en: "The price" } },
                { id: "service", label: { da: "Servicen", en: "The service" } },
                { id: "competitor", label: { da: "Bedre tilbud fra anden leverandør", en: "Better offer from another provider" } },
                { id: "needs", label: { da: "Ændrede behov", en: "Changed needs" } },
                { id: "other", label: { da: "Andet", en: "Other" } },
              ],
            },
            {
              code: "churn_competitor",
              type: "short_text",
              label: { da: "Hvilken leverandør er du skiftet til?", en: "Which provider did you switch to?" },
              visibleIf: [{ questionCode: "churn_reason", op: "eq", value: "competitor" }],
            },
            {
              code: "winback",
              type: "long_text",
              label: { da: "Hvad kunne have fået dig til at blive?", en: "What could have made you stay?" },
            },
          ],
        },
      ],
      messages,
    },
  },
  {
    key: "product_feedback",
    name: "Produktfeedback / Product feedback",
    category: "product_feedback",
    description: "Struktureret feedback på et produkt eller en funktion. / Structured feedback on a product or feature.",
    definition: {
      ...base,
      blocks: [
        {
          id: "b1",
          questions: [
            {
              code: "usage_freq",
              type: "single_choice",
              label: { da: "Hvor ofte bruger du produktet?", en: "How often do you use the product?" },
              options: [
                { id: "daily", label: { da: "Dagligt", en: "Daily" } },
                { id: "weekly", label: { da: "Ugentligt", en: "Weekly" } },
                { id: "monthly", label: { da: "Månedligt", en: "Monthly" } },
                { id: "rarely", label: { da: "Sjældnere", en: "Less often" } },
              ],
            },
            {
              code: "satisfaction_matrix",
              type: "matrix",
              label: { da: "Hvor enig er du i følgende udsagn?", en: "How much do you agree with the following statements?" },
              rows: [
                { id: "easy", label: { da: "Produktet er let at bruge", en: "The product is easy to use" } },
                { id: "value", label: { da: "Produktet er pengene værd", en: "The product is worth the money" } },
                { id: "reliable", label: { da: "Produktet er pålideligt", en: "The product is reliable" } },
              ],
              options: [
                { id: "1", label: { da: "Helt uenig", en: "Strongly disagree" }, value: 1 },
                { id: "2", label: { da: "Uenig", en: "Disagree" }, value: 2 },
                { id: "3", label: { da: "Hverken/eller", en: "Neutral" }, value: 3 },
                { id: "4", label: { da: "Enig", en: "Agree" }, value: 4 },
                { id: "5", label: { da: "Helt enig", en: "Strongly agree" }, value: 5 },
              ],
            },
            { code: "feature_wish", type: "long_text", label: { da: "Hvad ville du ønske, produktet kunne?", en: "What do you wish the product could do?" } },
          ],
        },
      ],
      messages,
    },
  },
  {
    key: "employee_feedback",
    name: "Medarbejder-/medlemsfeedback / Employee or member feedback",
    category: "employee",
    description: "Intern puls- eller medlemsmåling. / Internal pulse or member measurement.",
    definition: {
      ...base,
      blocks: [
        {
          id: "b1",
          questions: [
            {
              code: "enps_score",
              type: "nps",
              label: {
                da: "Hvor sandsynligt er det, at du vil anbefale os som arbejdsplads? (0-10)",
                en: "How likely are you to recommend us as a workplace? (0-10)",
              },
              required: true,
            },
            {
              code: "wellbeing",
              type: "likert",
              label: { da: "Jeg trives i min hverdag", en: "I am thriving day to day" },
              options: [
                { id: "1", label: { da: "Helt uenig", en: "Strongly disagree" }, value: 1 },
                { id: "2", label: { da: "Uenig", en: "Disagree" }, value: 2 },
                { id: "3", label: { da: "Hverken/eller", en: "Neutral" }, value: 3 },
                { id: "4", label: { da: "Enig", en: "Agree" }, value: 4 },
                { id: "5", label: { da: "Helt enig", en: "Strongly agree" }, value: 5 },
              ],
            },
            { code: "enps_open", type: "long_text", label: { da: "Hvad ville gøre den største forskel for dig?", en: "What would make the biggest difference for you?" } },
          ],
        },
      ],
      messages,
    },
  },
];
