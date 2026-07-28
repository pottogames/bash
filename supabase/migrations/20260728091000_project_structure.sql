-- =============================================================================
-- Project structure: project → building → floor → zone → space.
--
-- Why five levels and not two:
--
--   A quote is not a single number, it is a number *per place*. "How much
--   flooring?" is unanswerable; "how much flooring on floor 3 of building B,
--   excluding the lobby" is a purchase order. Every level below exists because
--   somebody on a real site needs a total at exactly that granularity:
--
--     project   — what the client signs and pays for
--     building  — what gets its own permit, its own crane, its own schedule
--     floor     — what a subcontractor is dispatched to on a given week, and
--                 the level at which typical floors repeat
--     zone      — what gets handed over as a unit: a flat, the lobby, the car
--                 park. This is the level a client asks about by name.
--     space     — a single room. Optional, and only worth entering where the
--                 finish schedule differs per room.
--
-- Quantities attach to the deepest level that is known, and roll up. A layer
-- measured on a floor plan lands on the floor; if its geometry falls inside a
-- zone's outline, the zone is filled in too, so the same measurement answers
-- both questions without being counted twice.
-- =============================================================================

create type public.project_status as enum (
  'draft',        -- being set up, plans not yet uploaded
  'takeoff',      -- quantities being produced and reviewed
  'quoting',      -- quote being assembled
  'tendering',    -- packages out with subcontractors
  'awarded',
  'in_progress',
  'completed',
  'archived'
);

create type public.zone_kind as enum (
  'apartment',    -- דירה
  'lobby',        -- לובי
  'parking',      -- חניון
  'core',         -- ליבה — מדרגות ומעליות
  'shaft',        -- פיר
  'storage',      -- מחסנים
  'commercial',   -- מסחר
  'technical',    -- חדרי מכונות
  'shelter',      -- ממ"ד / מקלט
  'roof',         -- גג
  'outdoor',      -- פיתוח חוץ
  'common'        -- שטחים משותפים
);

-- -----------------------------------------------------------------------------
-- Projects
-- -----------------------------------------------------------------------------
create table public.projects (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  name          text not null check (length(trim(name)) > 0),
  code          text,                       -- the office's own job number
  client_name   text,
  address       text,
  city          text,
  gush_helka    text,                       -- גוש/חלקה
  status        public.project_status not null default 'draft',

  -- Defaults inherited by every floor unless overridden. Storey height is the
  -- single most-used number in a take-off — every wall area and every concrete
  -- volume depends on it — so it belongs at the top and gets overridden below.
  default_storey_height_m numeric(6, 3) check (default_storey_height_m > 0),
  currency      text not null default 'ILS',
  vat_rate      numeric(5, 4) not null default 0.18 check (vat_rate >= 0 and vat_rate < 1),

  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (org_id, code)
);

create index projects_org_idx on public.projects (org_id, status);

-- -----------------------------------------------------------------------------
-- Buildings
-- -----------------------------------------------------------------------------
create table public.buildings (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  name         text not null,               -- "בניין A"
  code         text,
  description  text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (project_id, name)
);

create index buildings_project_idx on public.buildings (project_id, sort_order);

-- -----------------------------------------------------------------------------
-- Floors
--
-- `level` is the signed storey number: −2 is the second basement, 0 is ground,
-- 900 is the roof. It sorts correctly and it is what layer names encode, so
-- automatic floor detection has something unambiguous to write into.
-- -----------------------------------------------------------------------------
create table public.floors (
  id             uuid primary key default gen_random_uuid(),
  building_id    uuid not null references public.buildings (id) on delete cascade,
  level          integer not null,
  name           text not null,             -- "קומה 3", "מרתף 1", "גג"
  code           text,

  -- Absolute height of the finished floor, in metres, relative to project datum.
  elevation_m    numeric(8, 3),
  storey_height_m numeric(6, 3) check (storey_height_m > 0),

  gross_area_m2  numeric(12, 3) check (gross_area_m2 >= 0),
  net_area_m2    numeric(12, 3) check (net_area_m2 >= 0),

  -- Typical-floor handling. Rather than duplicating a floor eight times and
  -- carrying eight copies of every quantity, one floor is marked as the
  -- template and `repeat_count` multiplies its quantities. `repeats_floor_id`
  -- points the copies back at it, so a correction to the template is a
  -- correction everywhere — which is the entire reason typical floors exist.
  repeat_count      integer not null default 1 check (repeat_count >= 1),
  repeats_floor_id  uuid references public.floors (id) on delete set null,

  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (building_id, level),
  constraint floors_no_self_repeat check (repeats_floor_id is null or repeats_floor_id <> id),
  -- A floor that mirrors another must not also claim its own repeat count;
  -- otherwise the same quantity is multiplied twice.
  constraint floors_repeat_exclusive check (repeats_floor_id is null or repeat_count = 1)
);

create index floors_building_idx on public.floors (building_id, level);

-- -----------------------------------------------------------------------------
-- Zones — the level a client and a subcontractor both talk in.
-- -----------------------------------------------------------------------------
create table public.zones (
  id            uuid primary key default gen_random_uuid(),
  floor_id      uuid not null references public.floors (id) on delete cascade,
  kind          public.zone_kind not null default 'apartment',
  name          text not null,              -- "דירה 3", "לובי כניסה"
  code          text,

  gross_area_m2 numeric(12, 3) check (gross_area_m2 >= 0),
  net_area_m2   numeric(12, 3) check (net_area_m2 >= 0),
  -- Balconies and service areas are priced differently from interior floor
  -- area, so they are held apart rather than folded into the net figure.
  balcony_area_m2 numeric(12, 3) check (balcony_area_m2 >= 0),
  perimeter_m   numeric(12, 3) check (perimeter_m >= 0),
  room_count    numeric(4, 1) check (room_count >= 0),  -- 3.5 חדרים

  -- The zone outline in plan coordinates (metres), used to decide which
  -- measured entities fall inside it. Stored as a JSON ring rather than PostGIS
  -- geometry: the containment test lives in the geometry package, which already
  -- owns every other spatial decision in the system, and adding PostGIS would
  -- put a second, differently-behaving implementation in the stack.
  outline       jsonb,

  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (floor_id, name)
);

create index zones_floor_idx on public.zones (floor_id, sort_order);

-- -----------------------------------------------------------------------------
-- Spaces — individual rooms. Optional.
-- -----------------------------------------------------------------------------
create table public.spaces (
  id             uuid primary key default gen_random_uuid(),
  zone_id        uuid not null references public.zones (id) on delete cascade,
  name           text not null,             -- "סלון", "חדר רחצה הורים"
  code           text,
  floor_area_m2  numeric(12, 3) check (floor_area_m2 >= 0),
  wall_area_m2   numeric(12, 3) check (wall_area_m2 >= 0),
  ceiling_area_m2 numeric(12, 3) check (ceiling_area_m2 >= 0),
  perimeter_m    numeric(12, 3) check (perimeter_m >= 0),
  clear_height_m numeric(6, 3) check (clear_height_m > 0),
  outline        jsonb,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (zone_id, name)
);

create index spaces_zone_idx on public.spaces (zone_id, sort_order);

-- -----------------------------------------------------------------------------
-- Convenience view: the whole tree flattened, with the org id every RLS policy
-- needs, so a screen can load a project's structure in one query.
-- -----------------------------------------------------------------------------
create view public.structure_tree
with (security_invoker = true)
as
select
  p.org_id,
  p.id   as project_id,
  p.name as project_name,
  b.id   as building_id,
  b.name as building_name,
  f.id   as floor_id,
  f.level,
  f.name as floor_name,
  f.repeat_count,
  f.storey_height_m,
  z.id   as zone_id,
  z.kind as zone_kind,
  z.name as zone_name,
  z.net_area_m2 as zone_net_area_m2,
  s.id   as space_id,
  s.name as space_name,
  s.floor_area_m2 as space_floor_area_m2
from public.projects p
left join public.buildings b on b.project_id = p.id
left join public.floors    f on f.building_id = b.id
left join public.zones     z on z.floor_id = f.id
left join public.spaces    s on s.zone_id = z.id;

create trigger projects_touch  before update on public.projects  for each row execute function public.touch_updated_at();
create trigger buildings_touch before update on public.buildings for each row execute function public.touch_updated_at();
create trigger floors_touch    before update on public.floors    for each row execute function public.touch_updated_at();
create trigger zones_touch     before update on public.zones     for each row execute function public.touch_updated_at();
create trigger spaces_touch    before update on public.spaces    for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Project-scoped permission check.
--
-- Lives here rather than beside `has_permission` because its body reads
-- `public.projects`, and Postgres validates a `language sql` body when the
-- function is created — so it cannot exist before the table does.
-- -----------------------------------------------------------------------------
create or replace function public.has_project_permission(target_project uuid, perm public.app_permission)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_permission(p.org_id, perm)
  from public.projects p
  where p.id = target_project;
$$;
