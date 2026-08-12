export const MAX_SUBMISSION_INTERACTIONS = 300;
export const MAX_PROTOTYPE_INTERACTIONS_PER_QUESTION = 90;
export const MAX_FIRST_CLICK_INTERACTIONS_PER_QUESTION = 1;

/** Worst-case client telemetry budget used at publication and submission time. */
export function requiredInteractionBudget(questionTypes: readonly string[]): number {
  return questionTypes.reduce((total, type) => total
    + (type === "prototype_test" ? MAX_PROTOTYPE_INTERACTIONS_PER_QUESTION
      : type === "first_click" ? MAX_FIRST_CLICK_INTERACTIONS_PER_QUESTION
        : 0), 0);
}