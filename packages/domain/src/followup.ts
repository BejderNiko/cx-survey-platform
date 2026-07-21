import { z } from "zod";
import { conditionsHold, type AnswerMap } from "./logic";
import { condition } from "./instrument";

/**
 * Follow-up rule engine: evaluated when a response completes. Conditions
 * reuse the instrument condition language against the response's answers.
 */

export const followupAction = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_case"),
    title: z.string(),
    priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
    assigneeEmail: z.string().optional(), // resolved to a user at evaluation time
    dueInHours: z.number().optional(),
  }),
  z.object({
    type: z.literal("alert"),
    notifyEmail: z.string().optional(), // org member to notify (in-app notification)
    title: z.string(),
  }),
  z.object({
    type: z.literal("add_tag"),
    tag: z.string(), // tag applied to linked panelist, if any
  }),
]);
export type FollowupAction = z.infer<typeof followupAction>;

export const followupRuleDefinition = z.object({
  conditions: z.array(condition).min(1), // AND semantics
  actions: z.array(followupAction).min(1),
});
export type FollowupRuleDefinition = z.infer<typeof followupRuleDefinition>;

export interface RuleLike {
  id: string;
  studyId: string | null;
  isActive: boolean;
  conditions: unknown;
  actions: unknown;
}

export interface MatchedRule {
  ruleId: string;
  actions: FollowupAction[];
}

/** Return rules whose conditions all hold for the given answers. */
export function evaluateRules(
  rules: ReadonlyArray<RuleLike>,
  studyId: string,
  answers: AnswerMap,
): MatchedRule[] {
  const matches: MatchedRule[] = [];
  for (const rule of rules) {
    if (!rule.isActive) continue;
    if (rule.studyId !== null && rule.studyId !== studyId) continue;
    const parsed = followupRuleDefinition.safeParse({
      conditions: rule.conditions,
      actions: rule.actions,
    });
    if (!parsed.success) continue; // malformed rules never fire
    if (conditionsHold(parsed.data.conditions, answers)) {
      matches.push({ ruleId: rule.id, actions: parsed.data.actions });
    }
  }
  return matches;
}
