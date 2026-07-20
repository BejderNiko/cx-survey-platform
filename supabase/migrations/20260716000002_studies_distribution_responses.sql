-- Studies (instrument versioning), distribution/delivery, responses, follow-up.

create type study_status as enum ('draft','review','scheduled','live','paused','closed','archived');
create type distribution_kind as enum ('public_link','panel_invite','trigger');
create type invitation_status as enum
  ('queued','sent','delivered','opened','clicked','started','completed','bounced','unsubscribed','failed');
create type response_status as enum ('started','completed','disqualified','abandoned');
create type case_status as enum ('new','assigned','in_progress','waiting','resolved','dismissed');
create type case_priority as enum ('low','normal','high','critical');

-- ---------------------------------------------------------------------------
-- Studies. The instrument (blocks/questions/logic/messages/translations) is a
-- versioned JSONB document validated by @ok/domain zod schemas. Published
-- versions are immutable; responses reference the exact version they answered.
-- ---------------------------------------------------------------------------
create table studies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  workspace_id uuid not null references workspaces(id),
  title text not null,
  description text,
  study_type text not null default 'survey',   -- survey | first_click | mixed
  method_tags text[] not null default '{}',    -- e.g. {nps,relational} or {first_click}
  status study_status not null default 'draft',
  owner_id uuid not null references users(id),
  folder text,
  tags text[] not null default '{}',
  -- Mutable draft of the instrument; publish snapshots it into study_versions.
  draft_definition jsonb not null default '{}'::jsonb,
  theme jsonb not null default '{}'::jsonb,    -- design tokens: colors, logo slot
  settings jsonb not null default '{}'::jsonb, -- schedule, quotas, anonymity policy
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on studies (org_id, status);
create index on studies (org_id, workspace_id);

create table study_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  study_id uuid not null references studies(id) on delete cascade,
  version_number int not null,
  definition jsonb not null,        -- immutable instrument snapshot
  -- Versioned metric definitions active for this instrument (e.g. NPS bands),
  -- so later wording/scale changes cannot silently corrupt trends.
  metric_definitions jsonb not null default '{}'::jsonb,
  published_by uuid not null references users(id),
  published_at timestamptz not null default now(),
  unique (study_id, version_number)
);

create table study_collaborators (
  study_id uuid not null references studies(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  role text not null default 'editor',  -- editor | reviewer
  primary key (study_id, user_id)
);

create table templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,  -- null = built-in
  name text not null,
  category text not null,           -- relational_nps | transactional_nps | csat | ces | onboarding | service_recovery | churn | product_feedback | employee | ux_research
  description text,
  definition jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Distribution & delivery
-- ---------------------------------------------------------------------------
create table distributions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  study_id uuid not null references studies(id) on delete cascade,
  study_version_id uuid not null references study_versions(id),
  kind distribution_kind not null,
  name text not null,
  status text not null default 'active',   -- active | paused | closed
  -- Frozen audience: panelist ids, selection method, random seed, filters.
  audience_snapshot jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,  -- schedule, quota, throttle, reminders
  public_token text unique,                     -- for public_link kind
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  closes_at timestamptz
);
create index on distributions (org_id, study_id);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  distribution_id uuid not null references distributions(id) on delete cascade,
  panelist_id uuid references panelists(id) on delete set null, -- null after anonymization
  token text not null unique,
  status invitation_status not null default 'queued',
  sent_at timestamptz,
  status_changed_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);
create index on invitations (org_id, distribution_id, status);

-- Simulated development outbox. No real email/SMS is ever sent from local dev.
create table outbox_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  distribution_id uuid references distributions(id) on delete cascade,
  invitation_id uuid references invitations(id) on delete cascade,
  channel text not null default 'email',
  to_address text not null,
  subject text not null,
  body text not null,
  status text not null default 'simulated_sent',
  created_at timestamptz not null default now()
);
create index on outbox_messages (org_id, created_at desc);

-- Inbound event boundary (CRM/service systems trigger surveys).
create table trigger_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  source text not null,             -- e.g. webhook:crm
  idempotency_key text not null,
  payload jsonb not null,
  status text not null default 'received',  -- received | processed | rejected | dead_letter
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (org_id, idempotency_key)
);

alter table contact_events
  add constraint contact_events_distribution_fk
  foreign key (distribution_id) references distributions(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Responses
-- ---------------------------------------------------------------------------
create table responses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  study_id uuid not null references studies(id) on delete cascade,
  study_version_id uuid not null references study_versions(id),
  distribution_id uuid references distributions(id) on delete set null,
  invitation_id uuid references invitations(id) on delete set null,
  panelist_id uuid references panelists(id) on delete set null,  -- unlinked on anonymization
  respondent_key text not null,     -- pseudonymous per-response key used in datasets
  status response_status not null default 'started',
  language text not null default 'da',
  channel text not null default 'link',   -- link | email | qr | trigger
  device jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  meta jsonb not null default '{}'::jsonb
);
create index on responses (org_id, study_id, status);
create index on responses (org_id, started_at desc);

create table response_answers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  response_id uuid not null references responses(id) on delete cascade,
  question_code text not null,
  question_type text not null,
  value jsonb not null,             -- typed by question_type; multi-select = array
  answered_at timestamptz not null default now(),
  unique (response_id, question_code)
);
create index on response_answers (org_id, response_id);

-- Interaction telemetry for method-based studies (first click, later: tree tests).
create table interaction_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  response_id uuid not null references responses(id) on delete cascade,
  question_code text not null,
  event_type text not null,         -- first_click | screen_view
  payload jsonb not null,           -- e.g. {x, y, elapsed_ms, natural_width, natural_height}
  created_at timestamptz not null default now()
);
create index on interaction_events (org_id, response_id);

-- ---------------------------------------------------------------------------
-- Follow-up (closed loop)
-- ---------------------------------------------------------------------------
create table followup_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  study_id uuid references studies(id) on delete cascade,  -- null = org-wide
  name text not null,
  is_active boolean not null default true,
  -- Conditions: [{questionCode|metric, op, value}]; all must match.
  conditions jsonb not null,
  -- Actions: [{type: alert|assign|create_case|add_tag, ...params}]
  actions jsonb not null,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table followup_cases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  study_id uuid references studies(id) on delete set null,
  response_id uuid references responses(id) on delete set null,
  rule_id uuid references followup_rules(id) on delete set null,
  title text not null,
  priority case_priority not null default 'normal',
  status case_status not null default 'new',
  assignee_id uuid references users(id),
  due_at timestamptz,
  resolution text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on followup_cases (org_id, status);
create index on followup_cases (org_id, assignee_id);

create table followup_activity (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  case_id uuid not null references followup_cases(id) on delete cascade,
  actor_id uuid references users(id),
  activity_type text not null,      -- created | assigned | status_change | note
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on followup_activity (org_id, case_id);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  kind text not null,               -- alert | assignment | mention
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications (org_id, user_id, read_at);
