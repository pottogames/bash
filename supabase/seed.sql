-- =============================================================================
-- Local development seed data.
--
-- Runs only via `supabase db reset` / `supabase start` against your own local
-- project — it is never applied to a hosted Supabase project, and it is not a
-- migration. What it creates:
--
--   1. One organisation and one sample project with a full building → floor →
--      zone structure, so the app has something to show right after `supabase
--      start` instead of a wall of empty states.
--   2. A `seed_bootstrap_owner(email)` helper to attach your own local user as
--      that organisation's owner — see "First login" below.
--
-- System roles and the trade taxonomy are already seeded by
-- `migrations/20260728095000_seed_roles_and_trades.sql`; this file only adds
-- the organisation-specific rows a fresh org would otherwise start without.
-- =============================================================================

insert into public.organizations (id, name, slug) values
  ('11111111-1111-1111-1111-111111111111', 'ארגון לדוגמה', 'demo-org')
on conflict (id) do nothing;

insert into public.projects (
  id, org_id, name, code, client_name, city, status, default_storey_height_m
) values (
  '11111111-1111-1111-1111-111111111112',
  '11111111-1111-1111-1111-111111111111',
  'מגדל הדגמה — פרויקט לדוגמה',
  'DEMO-01',
  'יזמות לדוגמה בע״מ',
  'תל אביב',
  'takeoff',
  2.85
)
on conflict (id) do nothing;

insert into public.buildings (id, project_id, name, sort_order) values
  ('11111111-1111-1111-1111-111111111113', '11111111-1111-1111-1111-111111111112', 'בניין A', 10)
on conflict (id) do nothing;

-- Ground floor plus a typical-floor template repeated three times, and a roof
-- — enough range to exercise `repeat_count`, negative levels, and the
-- top-of-building case in the same seed.
insert into public.floors (
  id, building_id, level, name, storey_height_m, gross_area_m2, net_area_m2, repeat_count, sort_order
) values
  ('11111111-1111-1111-1111-111111111121', '11111111-1111-1111-1111-111111111113', -1, 'מרתף חניון', 3.00, 850.0, 780.0, 1, 0),
  ('11111111-1111-1111-1111-111111111122', '11111111-1111-1111-1111-111111111113', 0,  'קומת קרקע — לובי ומסחר', 3.50, 420.0, 360.0, 1, 10),
  ('11111111-1111-1111-1111-111111111123', '11111111-1111-1111-1111-111111111113', 1,  'קומה טיפוסית', 2.85, 480.0, 410.0, 3, 20),
  ('11111111-1111-1111-1111-111111111124', '11111111-1111-1111-1111-111111111113', 900, 'גג', null, 420.0, 60.0, 1, 30)
on conflict (id) do nothing;

insert into public.zones (id, floor_id, kind, name, gross_area_m2, net_area_m2, room_count, sort_order) values
  ('11111111-1111-1111-1111-111111111131', '11111111-1111-1111-1111-111111111121', 'parking', 'חניון', 850.0, 780.0, null, 0),
  ('11111111-1111-1111-1111-111111111132', '11111111-1111-1111-1111-111111111122', 'lobby', 'לובי כניסה', 120.0, 100.0, null, 0),
  ('11111111-1111-1111-1111-111111111133', '11111111-1111-1111-1111-111111111122', 'commercial', 'חנות 1', 150.0, 130.0, null, 10),
  ('11111111-1111-1111-1111-111111111134', '11111111-1111-1111-1111-111111111123', 'apartment', 'דירה A', 95.0, 82.0, 4.0, 0),
  ('11111111-1111-1111-1111-111111111135', '11111111-1111-1111-1111-111111111123', 'apartment', 'דירה B', 110.0, 96.0, 4.5, 10),
  ('11111111-1111-1111-1111-111111111136', '11111111-1111-1111-1111-111111111124', 'roof', 'גג טכני', 420.0, 60.0, null, 0)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- First login
-- -----------------------------------------------------------------------------
-- Nothing above grants anyone access to this organisation — that gate is the
-- point of the whole schema, and this file does not get to skip it. Sign up
-- your own account once, the ordinary way the app offers (its sign-up screen
-- creates the `auth.users` row this function looks for; no invitation code is
-- required to create the account itself, only to redeem into a *pending*
-- membership). Then, from the SQL editor or `psql`, run:
--
--   select public.seed_bootstrap_owner('you@example.com');
--
-- That attaches your account to the seed organisation above as an active
-- owner directly — the one step the product intentionally has no UI for,
-- since every other membership is meant to start from an invitation.
create or replace function public.seed_bootstrap_owner(
  user_email citext,
  target_org uuid default '11111111-1111-1111-1111-111111111111'
)
returns void
language plpgsql
as $$
declare
  target_user uuid;
begin
  select id into target_user from auth.users where email = user_email;
  if target_user is null then
    raise exception 'No auth.users row for %. Sign up through the app first, then re-run this.', user_email;
  end if;

  insert into public.memberships (
    org_id, user_id, role_id, status, approved_by, approved_at, approved_role_id
  )
  values (
    target_org, target_user, '00000000-0000-0000-0000-000000000001', 'active',
    target_user, now(), '00000000-0000-0000-0000-000000000001'
  )
  on conflict (org_id, user_id) do update set
    status = 'active',
    role_id = excluded.role_id,
    approved_by = excluded.approved_by,
    approved_at = excluded.approved_at,
    approved_role_id = excluded.approved_role_id;
end;
$$;
