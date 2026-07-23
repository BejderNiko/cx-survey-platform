/**
 * Central permission policy. Enforced server-side in every command
 * (apps/web/lib/actions) and used by the UI to hide disallowed controls.
 * RLS provides the hard tenant boundary underneath.
 */
export const ROLES = [
  "owner",
  "administrator",
  "researcher",
  "panel_manager",
  "analyst",
  "viewer",
] as const;
export type Role = (typeof ROLES)[number];

export const ACTIONS = [
  // administration
  "org.manage",
  "members.invite",
  "members.deactivate",
  "members.change_role",
  "audit.view",
  // panel
  "panel.view",
  "panel.edit",
  "panel.import",
  "panel.export",
  "panel.anonymize",
  "segments.manage",
  "recruitment.manage",
  // studies
  "studies.view",
  "studies.create",
  "studies.edit",
  "studies.publish",
  "studies.close",
  "studies.delete",
  // distribution
  "distributions.view",
  "distributions.create",
  // responses & follow-up
  "responses.view",
  "followup.view",
  "followup.manage",
  "followup.rules.manage",
  // analytics
  "analytics.view",
  "analytics.run",
  "datasets.create",
  "datasets.export",
  // collaboration
  "comments.create",
  "comments.resolve",
] as const;
export type Action = (typeof ACTIONS)[number];

const VIEW_ACTIONS: Action[] = [
  "panel.view",
  "studies.view",
  "distributions.view",
  "responses.view",
  "followup.view",
  "analytics.view",
];

const RESEARCH_ACTIONS: Action[] = [
  ...VIEW_ACTIONS,
  "comments.create",
  "comments.resolve",
  "studies.create",
  "studies.edit",
  "studies.publish",
  "studies.close",
  "distributions.create",
  "followup.manage",
  "analytics.run",
];

const MATRIX: Record<Role, ReadonlySet<Action>> = {
  owner: new Set(ACTIONS),
  administrator: new Set(ACTIONS),
  researcher: new Set(RESEARCH_ACTIONS),
  panel_manager: new Set([
    ...VIEW_ACTIONS,
    "comments.create",
    "panel.edit",
    "panel.import",
    "panel.export",
    "panel.anonymize",
    "segments.manage",
    "recruitment.manage",
    "distributions.create",
  ]),
  analyst: new Set([
    ...VIEW_ACTIONS,
    "comments.create",
    "analytics.run",
    "datasets.create",
    "datasets.export",
    "panel.export",
  ]),
  viewer: new Set([...VIEW_ACTIONS, "comments.create"]),
};

export function can(role: Role, action: Action): boolean {
  return MATRIX[role]?.has(action) ?? false;
}

export function assertCan(role: Role, action: Action): void {
  if (!can(role, action)) {
    throw new PermissionError(role, action);
  }
}

export class PermissionError extends Error {
  readonly role: Role;
  readonly action: Action;
  constructor(role: Role, action: Action) {
    super(`Role '${role}' is not allowed to perform '${action}'`);
    this.name = "PermissionError";
    this.role = role;
    this.action = action;
  }
}
