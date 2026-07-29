-- =============================================================================
-- Plans, layers, quantities.
--
-- The rule this whole section is built around: **a number in `quantity_lines`
-- must be reproducible from `plan_entities` by the geometry package alone.**
-- No column here is ever filled in by estimation. `provenance_entity_ids` is
-- what makes that checkable — and what lets the UI highlight, on the drawing,
-- exactly the shapes that produced a disputed figure.
-- =============================================================================

create type public.plan_format as enum ('dxf', 'dwg', 'pdf_vector', 'ifc', 'raster');

create type public.plan_status as enum (
  'uploaded',
  'queued',
  'parsing',
  'parsed',
  'failed',
  'superseded'   -- a newer revision of the same drawing has been imported
);

create type public.scale_source as enum (
  'native_units',
  'ifc_units',
  'dimension_inference',
  'manual_calibration',
  'unknown'
);

create type public.measure_type as enum ('length', 'area', 'volume', 'count', 'weight');

create type public.classification_source as enum (
  'org_rule', 'layer_standard', 'keyword', 'geometry_hint', 'manual', 'none'
);

-- -----------------------------------------------------------------------------
-- Trades
--
-- Seeded with the built-in taxonomy, extensible per organisation. Kept as a
-- table rather than an enum precisely so a customer can add "זיגוג מיוחד"
-- without a migration.
-- -----------------------------------------------------------------------------
create table public.trades (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references public.organizations (id) on delete cascade,
  key         text not null,
  name_he     text not null,
  name_en     text not null,
  color       text not null default 'oklch(0.65 0.01 250)',
  default_measure public.measure_type not null default 'count',
  billable    boolean not null default true,
  is_system   boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint trades_scope check ((is_system and org_id is null) or (not is_system and org_id is not null)),
  constraint trades_key_unique unique nulls not distinct (org_id, key)
);

-- -----------------------------------------------------------------------------
-- Plans — one uploaded drawing.
-- -----------------------------------------------------------------------------
create table public.plans (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  -- A plan usually depicts one floor of one building, but not always — a
  -- section or a site plan belongs to neither, so both are nullable.
  building_id   uuid references public.buildings (id) on delete set null,
  floor_id      uuid references public.floors (id) on delete set null,

  name          text not null,
  original_filename text not null,
  format        public.plan_format not null,
  status        public.plan_status not null default 'uploaded',

  -- Private bucket path. There is no public URL for any of these, ever; the
  -- client receives a signed URL with a few minutes of life.
  storage_path  text not null,
  file_size_bytes bigint check (file_size_bytes >= 0),
  -- SHA-256 of the uploaded bytes. Re-uploading the same file is detected
  -- instead of silently producing a second set of quantities.
  content_hash  bytea,

  -- Envelope encryption: the data key that encrypted this file, itself
  -- encrypted under the project key. The plaintext data key exists only in the
  -- worker's memory, never on disk and never in this table.
  wrapped_data_key bytea,
  encryption_key_id text,

  -- Resolved scale, copied out of the parse so the banner does not need to
  -- re-read the whole plan.
  scale_source            public.scale_source not null default 'unknown',
  metres_per_source_unit  numeric(20, 12) not null default 1,
  scale_confidence        numeric(4, 3) not null default 0 check (scale_confidence between 0 and 1),
  scale_reason            text,

  -- Revision chain. A new upload of the same drawing points at the one it
  -- replaces, which is how renamed layers survive a revision.
  supersedes_plan_id uuid references public.plans (id) on delete set null,
  revision      integer not null default 1,

  parse_error   text,
  parsed_at     timestamptz,
  uploaded_by   uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index plans_project_idx on public.plans (project_id, status);
create index plans_floor_idx on public.plans (floor_id);
create unique index plans_content_hash_idx on public.plans (project_id, content_hash)
  where content_hash is not null and status <> 'superseded';

-- -----------------------------------------------------------------------------
-- Layers
--
-- `source_key` and `source_name` come from the file and are never edited.
-- `display_name` is the user's. Keeping them in separate columns is what makes
-- re-importing a revised drawing non-destructive: the match is on `source_key`,
-- so a name somebody typed six weeks ago is still there afterwards.
-- -----------------------------------------------------------------------------
create table public.plan_layers (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.plans (id) on delete cascade,

  source_key    text not null,
  source_name   text not null,
  display_name  text,

  trade_id      uuid references public.trades (id) on delete set null,
  measure_type  public.measure_type not null default 'count',

  classification_source public.classification_source not null default 'none',
  confidence    numeric(4, 3) not null default 0 check (confidence between 0 and 1),
  -- The evidence list, exactly as the classifier produced it. Rendered in the
  -- "why is this electrical?" popover — an explanation nobody can reproduce is
  -- not an explanation.
  evidence      jsonb not null default '[]'::jsonb,

  -- A user may move a layer to a floor the plan itself does not belong to,
  -- e.g. when one sheet carries two levels.
  floor_id      uuid references public.floors (id) on delete set null,
  zone_id       uuid references public.zones (id) on delete set null,

  color         text,
  visible       boolean not null default true,
  frozen        boolean not null default false,
  entity_count  integer not null default 0,

  -- Set when a user merges duplicate layers; the merged-away layer keeps its
  -- row so the import report stays truthful about what was in the file.
  merged_into_id uuid references public.plan_layers (id) on delete set null,
  excluded      boolean not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (plan_id, source_key),
  constraint layers_no_self_merge check (merged_into_id is null or merged_into_id <> id)
);

create index plan_layers_plan_idx on public.plan_layers (plan_id);
create index plan_layers_trade_idx on public.plan_layers (trade_id);

-- -----------------------------------------------------------------------------
-- Entities
--
-- The parsed geometry, in metres. This is the evidence base. It is large, so it
-- is stored as one row per entity with the shape in JSONB rather than in a
-- wide table — nothing queries inside the geometry in SQL, the geometry package
-- does that in the worker.
-- -----------------------------------------------------------------------------
create table public.plan_entities (
  id          text not null,
  plan_id     uuid not null references public.plans (id) on delete cascade,
  layer_key   text not null,
  kind        text not null,
  block_path  text[] not null default '{}',
  geometry    jsonb not null,
  handle      text,

  primary key (plan_id, id)
);

create index plan_entities_layer_idx on public.plan_entities (plan_id, layer_key);

-- -----------------------------------------------------------------------------
-- Organisation classification rules — the learning mechanism.
--
-- Every time somebody corrects a layer's trade, a rule is written here and
-- consulted first on the next import. This is what replaces a model: the system
-- gets better at *this customer's* drawings, from *this customer's* decisions,
-- at zero marginal cost and with every step inspectable.
-- -----------------------------------------------------------------------------
create table public.classification_rules (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  pattern     text not null,
  match_type  text not null default 'exact' check (match_type in ('exact', 'contains', 'regex')),
  trade_id    uuid not null references public.trades (id) on delete cascade,
  measure_type public.measure_type,
  -- Incremented every time the rule fires and nobody overrides it, decremented
  -- when somebody does. A rule that keeps being overridden sorts itself down.
  hit_count   integer not null default 0,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),

  unique (org_id, pattern, match_type)
);

create index classification_rules_org_idx on public.classification_rules (org_id, match_type);

-- -----------------------------------------------------------------------------
-- Quantity lines
-- -----------------------------------------------------------------------------
create table public.quantity_lines (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  plan_id       uuid references public.plans (id) on delete set null,
  layer_id      uuid references public.plan_layers (id) on delete set null,

  -- Where this quantity is. Filled to the deepest level that is known.
  building_id   uuid references public.buildings (id) on delete set null,
  floor_id      uuid references public.floors (id) on delete set null,
  zone_id       uuid references public.zones (id) on delete set null,
  space_id      uuid references public.spaces (id) on delete set null,

  trade_id      uuid references public.trades (id) on delete set null,
  description   text not null,
  measure_type  public.measure_type not null,
  unit          text not null,

  -- The measured value, exactly as the geometry package produced it. Never
  -- rounded in storage — rounding is a presentation decision, and rounding
  -- before summing is how a bill of quantities drifts.
  value         numeric(18, 6) not null,

  floor_multiplier numeric(8, 3) not null default 1 check (floor_multiplier > 0),
  waste_factor  numeric(5, 4) not null default 0 check (waste_factor >= 0 and waste_factor < 1),

  -- Extra dimensions the drawing cannot supply. A volume needs a height; a wall
  -- volume needs a thickness. Both are inputs, and both are visible as inputs.
  height_m      numeric(8, 3) check (height_m > 0),
  thickness_m   numeric(8, 4) check (thickness_m > 0),

  provenance_entity_ids text[] not null default '{}',
  warnings      jsonb not null default '[]'::jsonb,

  -- `manual` marks a line somebody typed rather than measured — scaffolding,
  -- site cleaning, anything the drawing does not contain. Segregated so a
  -- reviewer can always see which numbers came from the plan and which did not.
  is_manual     boolean not null default false,
  approved      boolean not null default false,
  approved_by   uuid references auth.users (id) on delete set null,
  approved_at   timestamptz,

  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index quantity_lines_project_idx on public.quantity_lines (project_id, trade_id);
create index quantity_lines_floor_idx on public.quantity_lines (floor_id);
create index quantity_lines_zone_idx on public.quantity_lines (zone_id);
create index quantity_lines_layer_idx on public.quantity_lines (layer_id);

-- The number that actually gets priced, computed once so no caller can get it
-- subtly wrong.
create or replace function public.billable_quantity(line public.quantity_lines)
returns numeric
language sql
immutable
as $$
  select line.value * line.floor_multiplier * (1 + line.waste_factor);
$$;

-- -----------------------------------------------------------------------------
-- Parse jobs — the worker queue.
--
-- Kept in Postgres rather than an external queue: the job's only input is a row
-- in this database and its only output is more rows in it, so a second system
-- would add a failure mode without removing one. `locked_until` plus
-- `for update skip locked` is enough for a worker pool of this size.
-- -----------------------------------------------------------------------------
create table public.parse_jobs (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.plans (id) on delete cascade,
  status        text not null default 'queued'
                  check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  attempts      integer not null default 0,
  max_attempts  integer not null default 3,
  locked_by     text,
  locked_until  timestamptz,
  error         text,
  -- Step-by-step progress, so the upload screen can say "reading layers" rather
  -- than showing a spinner for ninety seconds.
  progress      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz
);

create index parse_jobs_claimable_idx on public.parse_jobs (status, created_at)
  where status in ('queued', 'running');

create trigger trades_touch          before update on public.trades          for each row execute function public.touch_updated_at();
create trigger plans_touch           before update on public.plans           for each row execute function public.touch_updated_at();
create trigger plan_layers_touch     before update on public.plan_layers     for each row execute function public.touch_updated_at();
create trigger quantity_lines_touch  before update on public.quantity_lines  for each row execute function public.touch_updated_at();
