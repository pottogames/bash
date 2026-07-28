-- =============================================================================
-- Sheet kinds and multi-file uploads.
--
-- Two things a real project makes obvious the moment you look at one:
--
--   1. Nobody uploads one drawing. A set is a dozen sheets — floor plans,
--      sections, elevations, and at least one sheet of construction details.
--   2. Most of those sheets must never be measured. A details sheet holds six
--      waterproofing details at 1:5 and 1:10, each with its own hatched
--      concrete. Run a take-off over it and you get confident square metres
--      that correspond to nothing, and nothing about the output looks wrong.
--
-- So a plan now records what kind of sheet it is and whether it may be
-- measured, and an upload is a batch of files rather than a single one.
-- =============================================================================

create type public.sheet_kind as enum (
  'floor_plan',
  'detail_sheet',
  'section',
  'elevation',
  'site_plan',
  'schedule',
  'unknown'
);

-- -----------------------------------------------------------------------------
-- Upload batches
--
-- One row per "the architect sent me the set". Gives the import report
-- something to group by, and makes "re-run the whole set after a revision" a
-- single operation instead of a dozen.
-- -----------------------------------------------------------------------------
create table public.upload_batches (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  name          text,
  note          text,
  file_count    integer not null default 0 check (file_count >= 0),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index upload_batches_project_idx on public.upload_batches (project_id, created_at desc);

alter table public.plans
  add column batch_id uuid references public.upload_batches (id) on delete set null,

  add column sheet_kind public.sheet_kind not null default 'unknown',

  -- `false` blocks automatic take-off for this sheet. Set by the detector, and
  -- overridable by a human — but only deliberately, which is the point.
  add column measurable boolean not null default false,

  -- Who decided. A detector's `false` and a person's `false` mean different
  -- things when somebody asks later why a sheet was skipped.
  add column sheet_kind_source text not null default 'detector'
    check (sheet_kind_source in ('detector', 'manual')),

  -- The sentences the detector produced, shown verbatim in the import report.
  add column sheet_kind_reasons jsonb not null default '[]'::jsonb,

  -- Distinct scale notations found as text on the sheet, e.g. ["1:5","1:10"].
  -- More than one means the sheet has several viewports and no single scale.
  add column scale_notations text[] not null default '{}',

  -- The sheet number from the title block, when there is one.
  add column sheet_number text;

create index plans_batch_idx on public.plans (batch_id);
create index plans_measurable_idx on public.plans (project_id) where measurable;

comment on column public.plans.measurable is
  'False for details, sections, elevations, schedules, and any sheet carrying '
  'more than one scale. Take-off refuses to run on these; a person may override '
  'per layer, but has to do it knowingly.';

-- -----------------------------------------------------------------------------
-- RLS for the new table.
--
-- Same shape as `plans`: read with `plan.read`, write with `plan.upload`, and
-- separate commands so a write policy cannot widen reads.
-- -----------------------------------------------------------------------------
alter table public.upload_batches enable row level security;
alter table public.upload_batches force row level security;
revoke all on public.upload_batches from anon, authenticated;
grant select, insert, update, delete on public.upload_batches to authenticated;

create policy upload_batches_read on public.upload_batches
  for select to authenticated
  using (public.has_project_permission(project_id, 'plan.read'));

create policy upload_batches_insert on public.upload_batches
  for insert to authenticated
  with check (public.has_project_permission(project_id, 'plan.upload'));

create policy upload_batches_update on public.upload_batches
  for update to authenticated
  using (public.has_project_permission(project_id, 'plan.upload'))
  with check (public.has_project_permission(project_id, 'plan.upload'));

create policy upload_batches_delete on public.upload_batches
  for delete to authenticated
  using (public.has_project_permission(project_id, 'plan.delete'));

-- -----------------------------------------------------------------------------
-- Guard: a quantity line may not point at a plan that is not measurable.
--
-- The UI already refuses, and the worker already refuses. This is the third
-- place, because it is the one that holds when somebody writes to PostgREST
-- directly — and because a fictional quantity that reaches a quote is not
-- recoverable by apologising for it.
-- -----------------------------------------------------------------------------
create or replace function public.reject_quantities_from_unmeasurable_plans()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  plan_measurable boolean;
  plan_kind public.sheet_kind;
begin
  if new.plan_id is null then
    return new;  -- A manually entered line has no plan behind it.
  end if;

  select p.measurable, p.sheet_kind into plan_measurable, plan_kind
  from public.plans p where p.id = new.plan_id;

  if plan_measurable is null then
    return new;  -- Plan already gone; the foreign key will decide.
  end if;

  if not plan_measurable and not new.is_manual then
    raise exception
      'לא ניתן ליצור שורת כמות מגיליון שאינו ניתן למדידה (סוג: %). סמן את הגיליון כניתן למדידה במפורש, או הזן את השורה ידנית.',
      plan_kind
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger quantity_lines_require_measurable_plan
  before insert or update of plan_id, is_manual on public.quantity_lines
  for each row execute function public.reject_quantities_from_unmeasurable_plans();
