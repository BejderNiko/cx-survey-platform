import { instrumentDefinition, type InstrumentDefinition } from "@ok/domain";

export type DraftGenerationSource = "local-template";

export type DraftGenerationResult = {
  definition: InstrumentDefinition;
  source: DraftGenerationSource;
  notice: string;
};

/**
 * Local draft generator. It never sends the brief outside the application.
 * A provider adapter can replace this after a concrete provider is approved.
 */
export function generateLocalSurveyDraft(briefRaw: string): DraftGenerationResult {
  const brief = briefRaw.trim();
  if (!brief) throw new Error("Describe survey goal before generating a draft.");
  if (brief.length > 2000) throw new Error("Survey brief must be 2,000 characters or fewer.");
  const topic = brief.replace(/\s+/g, " ").replace(/[?.!]+$/, "") || "this topic";
  const definition = instrumentDefinition.parse({
    languages: ["da"],
    defaultLanguage: "da",
    participantDevice: "any",
    blocks: [{
      id: "generated-draft",
      title: { da: "Generated survey" },
      questions: [
        {
          code: "main_goal",
          type: "single_choice",
          label: { da: `What is your main goal related to ${topic}?` },
          required: true,
          options: [
            { id: "goal_a", label: { da: "Learn more" } },
            { id: "goal_b", label: { da: "Complete a task" } },
            { id: "goal_c", label: { da: "Compare options" } },
            { id: "goal_d", label: { da: "Something else" } },
          ],
        },
        {
          code: "priority_needs",
          type: "multiple_choice",
          label: { da: `Which needs matter most when working with ${topic}?` },
          required: false,
          multipleSelectMinLimit: 1,
          multipleSelectLimit: 2,
          options: [
            { id: "need_speed", label: { da: "Speed" } },
            { id: "need_clarity", label: { da: "Clarity" } },
            { id: "need_flexibility", label: { da: "Flexibility" } },
            { id: "need_support", label: { da: "Support" } },
          ],
        },
        {
          code: "follow_up",
          type: "long_text",
          label: { da: `What should improve about ${topic}?` },
          required: false,
        },
      ],
    }],
    messages: {},
  });
  return {
    definition,
    source: "local-template",
    notice: "Local draft generated. Review every question before saving or publishing.",
  };
}