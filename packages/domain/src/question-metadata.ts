import type { QuestionType } from "./instrument";

export type QuestionTypeGroup = "Score" | "Choice" | "Text" | "Scale" | "Matrix/ranking" | "Research tests";

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
  "Score", "Choice", "Text", "Scale", "Matrix/ranking", "Research tests",
];

export const QUESTION_TYPE_METADATA: Record<QuestionType, QuestionTypeMetadata> = {
  nps: { type: "nps", group: "Score", name: "NPS", description: "Loyalty on a 0-10 scale.", example: "How likely are you to recommend OK?", respondentAction: "Chooses one number from 0 to 10.", resultMeasure: "NPS and shares of promoters, passives and detractors." },
  csat: { type: "csat", group: "Score", name: "CSAT", description: "Satisfaction on a 1-5 scale.", example: "How satisfied are you with the support?", respondentAction: "Chooses one number from 1 to 5.", resultMeasure: "Satisfaction share and average." },
  ces: { type: "ces", group: "Score", name: "CES", description: "Perceived effort on a 1-7 scale.", example: "How easy was it to complete your task?", respondentAction: "Chooses one number from 1 to 7.", resultMeasure: "Average effort and low-effort share." },
  single_choice: { type: "single_choice", group: "Choice", name: "Single select", description: "Choose exactly one option.", example: "Which channel did you use?", respondentAction: "Chooses one answer option.", resultMeasure: "Count and share per option." },
  multiple_choice: { type: "multiple_choice", group: "Choice", name: "Multiple select", description: "Choose one or more options.", example: "Which features did you use?", respondentAction: "Chooses every relevant option.", resultMeasure: "Count of selections per option." },
  dropdown: { type: "dropdown", group: "Choice", name: "Dropdown", description: "Choose one option from a compact list.", example: "Choose your municipality.", respondentAction: "Opens the list and chooses one option.", resultMeasure: "Count and share per option." },
  consent: { type: "consent", group: "Choice", name: "Agreement", description: "Collect a clear yes or no.", example: "May we contact you for follow-up?", respondentAction: "Chooses yes or no.", resultMeasure: "Count of yes and no." },
  short_text: { type: "short_text", group: "Text", name: "Short text", description: "Collect a short free-text answer.", example: "What mattered most to you?", respondentAction: "Writes up to 500 characters.", resultMeasure: "Free text for qualitative analysis." },
  long_text: { type: "long_text", group: "Text", name: "Long text", description: "Collect a detailed free-text answer.", example: "Tell us about your experience.", respondentAction: "Writes a longer answer.", resultMeasure: "Detailed free text for coding and themes." },
  number: { type: "number", group: "Text", name: "Number", description: "Collect a numeric answer.", example: "How many times have you contacted us?", respondentAction: "Enters a number.", resultMeasure: "Distribution, average and median." },
  date: { type: "date", group: "Text", name: "Date", description: "Collect a calendar date.", example: "When did the event happen?", respondentAction: "Chooses a valid date.", resultMeasure: "Dates and time distribution." },
  rating: { type: "rating", group: "Scale", name: "Linear scale", description: "Use a flexible numeric scale.", example: "Rate the experience from 1 to 5.", respondentAction: "Chooses one scale step.", resultMeasure: "Distribution, average and median." },
  likert: { type: "likert", group: "Scale", name: "Likert scale", description: "Measure agreement or evaluation.", example: "I could easily find what I needed.", respondentAction: "Chooses one labelled scale step.", resultMeasure: "Distribution and average scale value." },
  matrix: { type: "matrix", group: "Matrix/ranking", name: "Matrix", description: "Use one scale for several statements.", example: "Rate price, support and quality.", respondentAction: "Chooses one answer in each row.", resultMeasure: "Distribution and average per row." },
  ranking: { type: "ranking", group: "Matrix/ranking", name: "Ranking", description: "Prioritize every option.", example: "Rank improvements by importance.", respondentAction: "Moves options into the desired order.", resultMeasure: "Position and average rank." },
  first_click: { type: "first_click", group: "Research tests", name: "First-click test", description: "Measure the first click on an image.", example: "Where would you click to pay?", respondentAction: "Clicks one place on the image.", resultMeasure: "Click position, distribution and time to click." },
  preference_test: { type: "preference_test", group: "Research tests", name: "Preference test", description: "Compare 2-8 images.", example: "Which design do you prefer?", respondentAction: "Chooses exactly one image.", resultMeasure: "Choice and share per image." },
  prototype_test: { type: "prototype_test", group: "Research tests", name: "Figma prototype", description: "Track navigation and clicks in a Figma prototype.", example: "Find and complete payment in the prototype.", respondentAction: "Consents to telemetry and uses the embedded prototype.", resultMeasure: "Frame sequence, goal completion, time, clicks and misclicks." },
};

export function groupedQuestionTypes(): { group: QuestionTypeGroup; items: QuestionTypeMetadata[] }[] {
  return QUESTION_TYPE_GROUP_ORDER.map((group) => ({
    group,
    items: Object.values(QUESTION_TYPE_METADATA).filter((item) => item.group === group),
  }));
}
