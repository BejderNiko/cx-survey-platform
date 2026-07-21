-- Analytics workspace (datasets, variables, recipes, runs, charts) and insights.

create type dataset_source as enum ('study_responses','file_import','derived');
create type analysis_status as enum ('pending','running','succeeded','failed');

create table datasets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  source_kind dataset_source not null,
  source_study_id uuid references studies(id) on delete set null,
  parent_dataset_id uuid references datasets(id) on delete set null, -- for derived
  owner_id uuid not null references users(id),
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table dataset_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  dataset_id uuid not null references datasets(id) on delete cascade,
  version_number int not null,
  row_count int not null default 0,
  variable_count int not null default 0,
  -- Lineage: source study version(s), parent dataset version, transformation steps.
  lineage jsonb not null default '{}'::jsonb,
  -- MVP stores rows inline as a JSONB array of objects keyed by variable name.
  -- Parquet in object storage is the documented later milestone for large data.
  rows jsonb not null default '[]'::jsonb,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  unique (dataset_id, version_number)
);

create table variables (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  dataset_version_id uuid not null references dataset_versions(id) on delete cascade,
  name text not null,               -- variable/question code, e.g. nps_score
  label text not null,
  var_type text not null,           -- numeric | string | date | boolean
  measure text not null,            -- nominal | ordinal | scale
  value_labels jsonb not null default '{}'::jsonb,   -- {"1": "Detractor", ...}
  missing_values jsonb not null default '[]'::jsonb, -- values treated as missing
  role text not null default 'input',                -- input | target | id | weight | none
  notes text,
  position int not null default 0,
  unique (dataset_version_id, name)
);

-- Saved, reproducible transformation pipelines (filter/recode/compute/aggregate).
create table transformation_recipes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  dataset_id uuid not null references datasets(id) on delete cascade,
  name text not null,
  steps jsonb not null,             -- ordered steps, validated by domain schema
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table analysis_recipes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  dataset_id uuid not null references datasets(id) on delete cascade,
  name text not null,
  procedure text not null,          -- frequencies | descriptives | crosstab | ttest_ind | ...
  params jsonb not null default '{}'::jsonb,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

create table analysis_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  recipe_id uuid references analysis_recipes(id) on delete set null,
  dataset_version_id uuid not null references dataset_versions(id),
  procedure text not null,
  params jsonb not null default '{}'::jsonb,
  status analysis_status not null default 'pending',
  seed bigint,                      -- recorded for bootstrap/sampling procedures
  library_versions jsonb not null default '{}'::jsonb,
  -- Full statistical contract: method, n, excluded rows, missing strategy,
  -- assumptions, estimates, SEs, CIs, test statistics, dof, p, effect sizes.
  results jsonb,
  error text,
  created_by uuid not null references users(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index on analysis_runs (org_id, dataset_version_id);

create table charts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  dataset_version_id uuid references dataset_versions(id) on delete cascade,
  analysis_run_id uuid references analysis_runs(id) on delete set null,
  title text not null,
  chart_type text not null,         -- bar | stacked_bar | line | histogram | box | scatter | heatmap | nps_trend | first_click_map
  spec jsonb not null,              -- chart config incl. variables and filters
  created_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Insights repository
-- ---------------------------------------------------------------------------
create table insights (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  summary text not null,
  status text not null default 'draft',    -- draft | validated | archived
  decision text,                            -- recommendation / decision taken
  owner_id uuid not null references users(id),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table evidence_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  insight_id uuid not null references insights(id) on delete cascade,
  entity_type text not null,        -- study | analysis_run | chart | response | dataset_version
  entity_id uuid not null,
  note text,
  created_at timestamptz not null default now()
);
create index on evidence_links (org_id, insight_id);
