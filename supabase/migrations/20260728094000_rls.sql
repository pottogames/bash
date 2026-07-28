-- =============================================================================
-- Row level security.
--
-- The threat model is not "a bug in the UI". It is a subcontractor who opens
-- devtools, copies the anon key and the JWT the app already gave them, and
-- queries PostgREST directly. Everything they are allowed to see must be
-- decided here, because that is the only layer they cannot go around.
--
-- Order of business:
--   1. Revoke the default grants, then enable RLS on every table. A table with
--      RLS on and no policy denies everything, which is the correct state for a
--      table somebody forgets to write a policy for.
--   2. Organisation members get access through `has_permission`.
--   3. External recipients get access through exactly one path —
--      `package_recipients` — and never through organisation membership.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Default deny
-- -----------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon, authenticated;

do $$
declare t record;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('alter table public.%I force row level security', t.tablename);
    execute format('revoke all on public.%I from anon, authenticated', t.tablename);
  end loop;
end $$;

-- PostgREST needs the table-level grant before a policy can widen anything;
-- the policies below are what actually decide the rows.
grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;

-- -----------------------------------------------------------------------------
-- 2. External access path
--
-- The one function that decides whether somebody outside the organisation may
-- see something. Deliberately narrow: a package, a live recipient row, an
-- unexpired grant. There is no second way in.
-- -----------------------------------------------------------------------------
create or replace function public.recipient_package_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.work_package_id
  from public.package_recipients r
  join public.work_packages wp on wp.id = r.work_package_id
  where r.user_id = auth.uid()
    and (r.access_expires_at is null or r.access_expires_at > now())
    and wp.status in ('sent', 'bidding', 'closed', 'awarded');
$$;

-- Whether the caller is a recipient with a specific capability on a package.
create or replace function public.recipient_can(target_package uuid, capability text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.package_recipients r
    join public.work_packages wp on wp.id = r.work_package_id
    where r.work_package_id = target_package
      and r.user_id = auth.uid()
      and (r.access_expires_at is null or r.access_expires_at > now())
      and wp.status in ('sent', 'bidding', 'closed', 'awarded')
      and case capability
            when 'quantities' then r.can_see_quantities
            when 'drawings'   then r.can_see_drawings
            when 'download'   then r.can_download
            else false
          end
  );
$$;

-- -----------------------------------------------------------------------------
-- A note on `for all`
--
-- Write policies below are written as three separate `insert` / `update` /
-- `delete` policies rather than one `for all`. This is not style. Permissive
-- policies are OR'd together and `for all` *includes* `select`, so a single
-- `for all ... using (has_permission(..., 'price.update'))` silently grants
-- read access to anybody who can write — which is exactly how somebody whose
-- `price.cost.read` was explicitly revoked would still have been able to read
-- the cost sheet. The RLS test suite catches it; splitting the commands is what
-- fixes it.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 3. Identity and organisation
-- -----------------------------------------------------------------------------
create policy profiles_self_read on public.profiles
  for select to authenticated
  using (id = auth.uid());

-- Members of the same organisation can see each other. A package recipient is
-- not a member, so a subcontractor never sees the staff list.
create policy profiles_org_read on public.profiles
  for select to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.user_id = profiles.id
      and m.org_id in (select public.current_org_ids())
  ));

create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy organizations_read on public.organizations
  for select to authenticated
  using (id in (select public.current_org_ids()));

create policy organizations_update on public.organizations
  for update to authenticated
  using (public.has_permission(id, 'org.manage'))
  with check (public.has_permission(id, 'org.manage'));

-- Roles: system roles are visible to every signed-in user (the sign-up screen
-- needs their names); custom roles only inside their organisation.
create policy roles_read on public.roles
  for select to authenticated
  using (is_system or org_id in (select public.current_org_ids()));

create policy roles_insert on public.roles
  for insert to authenticated
  with check (not is_system and public.has_permission(org_id, 'org.roles.manage'));

create policy roles_update on public.roles
  for update to authenticated
  using (not is_system and public.has_permission(org_id, 'org.roles.manage'))
  with check (not is_system and public.has_permission(org_id, 'org.roles.manage'));

create policy roles_delete on public.roles
  for delete to authenticated
  using (not is_system and public.has_permission(org_id, 'org.roles.manage'));

create policy role_permissions_read on public.role_permissions
  for select to authenticated
  using (exists (
    select 1 from public.roles r
    where r.id = role_permissions.role_id
      and (r.is_system or r.org_id in (select public.current_org_ids()))
  ));

create policy role_permissions_insert on public.role_permissions
  for insert to authenticated
  with check (exists (
    select 1 from public.roles r
    where r.id = role_permissions.role_id
      and not r.is_system
      and public.has_permission(r.org_id, 'org.roles.manage')
  ));

create policy role_permissions_update on public.role_permissions
  for update to authenticated
  using (exists (
    select 1 from public.roles r
    where r.id = role_permissions.role_id
      and not r.is_system
      and public.has_permission(r.org_id, 'org.roles.manage')
  ))
  with check (exists (
    select 1 from public.roles r
    where r.id = role_permissions.role_id
      and not r.is_system
      and public.has_permission(r.org_id, 'org.roles.manage')
  ));

create policy role_permissions_delete on public.role_permissions
  for delete to authenticated
  using (exists (
    select 1 from public.roles r
    where r.id = role_permissions.role_id
      and not r.is_system
      and public.has_permission(r.org_id, 'org.roles.manage')
  ));

-- Memberships: you can always see your own — including while it is pending, so
-- the "waiting for approval" screen has something to read.
create policy memberships_self_read on public.memberships
  for select to authenticated
  using (user_id = auth.uid());

create policy memberships_admin_read on public.memberships
  for select to authenticated
  using (public.has_permission(org_id, 'org.members.manage')
      or public.has_permission(org_id, 'org.members.approve'));

-- No insert or update policy exists for `memberships`, by design. The only ways
-- a row appears or becomes active are `redeem_invitation` and
-- `approve_membership`, both `security definer`. A client cannot write here at
-- all, so it cannot activate itself.
create policy memberships_admin_suspend on public.memberships
  for update to authenticated
  using (public.has_permission(org_id, 'org.members.manage'))
  with check (
    public.has_permission(org_id, 'org.members.manage')
    -- An administrator may suspend or revoke, never activate. Activation goes
    -- through `approve_membership`, which records who approved what.
    and status in ('suspended', 'revoked', 'expired')
  );

create policy membership_permissions_read on public.membership_permissions
  for select to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.id = membership_permissions.membership_id
      and (m.user_id = auth.uid() or public.has_permission(m.org_id, 'org.members.manage'))
  ));

create policy membership_permissions_insert on public.membership_permissions
  for insert to authenticated
  with check (exists (
    select 1 from public.memberships m
    where m.id = membership_permissions.membership_id
      and public.has_permission(m.org_id, 'org.members.manage')
  ));

create policy membership_permissions_update on public.membership_permissions
  for update to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.id = membership_permissions.membership_id
      and public.has_permission(m.org_id, 'org.members.manage')
  ))
  with check (exists (
    select 1 from public.memberships m
    where m.id = membership_permissions.membership_id
      and public.has_permission(m.org_id, 'org.members.manage')
  ));

create policy membership_permissions_delete on public.membership_permissions
  for delete to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.id = membership_permissions.membership_id
      and public.has_permission(m.org_id, 'org.members.manage')
  ));

-- Invitations: readable by administrators only, and never writable directly —
-- `create_invitation` is the only way to make one, because it is the only path
-- that hashes the code and writes the audit entry.
create policy invitations_admin_read on public.invitations
  for select to authenticated
  using (public.has_permission(org_id, 'org.members.invite')
      or public.has_permission(org_id, 'org.members.approve'));

create policy invitations_revoke on public.invitations
  for update to authenticated
  using (public.has_permission(org_id, 'org.members.invite'))
  with check (public.has_permission(org_id, 'org.members.invite') and status = 'revoked');

create policy audit_read on public.audit_log
  for select to authenticated
  using (public.has_permission(org_id, 'org.audit.read'));

-- No insert, update or delete policy on `audit_log`. Entries are written by
-- `security definer` functions and by the worker's service role. Nobody with a
-- user JWT can add a line to the record, and nobody at all can remove one.

-- -----------------------------------------------------------------------------
-- 4. Projects and structure
-- -----------------------------------------------------------------------------
create policy projects_read on public.projects
  for select to authenticated
  using (public.has_permission(org_id, 'project.read'));

create policy projects_insert on public.projects
  for insert to authenticated
  with check (public.has_permission(org_id, 'project.create'));

create policy projects_update on public.projects
  for update to authenticated
  using (public.has_permission(org_id, 'project.update'))
  with check (public.has_permission(org_id, 'project.update'));

create policy projects_delete on public.projects
  for delete to authenticated
  using (public.has_permission(org_id, 'project.delete'));

create policy buildings_read on public.buildings
  for select to authenticated
  using (public.has_project_permission(project_id, 'project.read'));

create policy buildings_insert on public.buildings
  for insert to authenticated
  with check (public.has_project_permission(project_id, 'structure.manage'));

create policy buildings_update on public.buildings
  for update to authenticated
  using (public.has_project_permission(project_id, 'structure.manage'))
  with check (public.has_project_permission(project_id, 'structure.manage'));

create policy buildings_delete on public.buildings
  for delete to authenticated
  using (public.has_project_permission(project_id, 'structure.manage'));

create policy floors_read on public.floors
  for select to authenticated
  using (exists (
    select 1 from public.buildings b
    where b.id = floors.building_id
      and public.has_project_permission(b.project_id, 'project.read')
  ));

create policy floors_insert on public.floors
  for insert to authenticated
  with check (exists (
    select 1 from public.buildings b
    where b.id = floors.building_id
      and public.has_project_permission(b.project_id, 'structure.manage')
  ));

create policy floors_update on public.floors
  for update to authenticated
  using (exists (
    select 1 from public.buildings b
    where b.id = floors.building_id
      and public.has_project_permission(b.project_id, 'structure.manage')
  ))
  with check (exists (
    select 1 from public.buildings b
    where b.id = floors.building_id
      and public.has_project_permission(b.project_id, 'structure.manage')
  ));

create policy floors_delete on public.floors
  for delete to authenticated
  using (exists (
    select 1 from public.buildings b
    where b.id = floors.building_id
      and public.has_project_permission(b.project_id, 'structure.manage')
  ));

create policy zones_read on public.zones
  for select to authenticated
  using (exists (
    select 1 from public.floors f
    join public.buildings b on b.id = f.building_id
    where f.id = zones.floor_id
      and public.has_project_permission(b.project_id, 'project.read')
  ));

create policy zones_insert on public.zones
  for insert to authenticated
  with check (exists (
    select 1 from public.floors f
    join public.buildings b on b.id = f.building_id
    where f.id = zones.floor_id
      and public.has_project_permission(b.project_id, 'structure.manage')
  ));

create policy zones_update on public.zones
  for update to authenticated
  using (exists (
    select 1 from public.floors f
    join public.buildings b on b.id = f.building_id
    where f.id = zones.floor_id
      and public.has_project_permission(b.project_id, 'structure.manage')
  ))
  with check (exists (
    select 1 from public.floors f
    join public.buildings b on b.id = f.building_id
    where f.id = zones.floor_id
      and public.has_project_permission(b.project_id, 'structure.manage')
  ));

create policy zones_delete on public.zones
  for delete to authenticated
  using (exists (
    select 1 from public.floors f
    join public.buildings b on b.id = f.building_id
    where f.id = zones.floor_id
      and public.has_project_permission(b.project_id, 'structure.manage')
  ));

create policy spaces_read on public.spaces
  for select to authenticated
  using (exists (
    select 1 from public.zones z
    join public.floors f on f.id = z.floor_id
    join public.buildings b on b.id = f.building_id
    where z.id = spaces.zone_id
      and public.has_project_permission(b.project_id, 'project.read')
  ));

create policy spaces_insert on public.spaces
  for insert to authenticated
  with check (exists (
    select 1 from public.zones z
    join public.floors f on f.id = z.floor_id
    join public.buildings b on b.id = f.building_id
    where z.id = spaces.zone_id
      and public.has_project_permission(b.project_id, 'structure.manage')
  ));

create policy spaces_update on public.spaces
  for update to authenticated
  using (exists (
    select 1 from public.zones z
    join public.floors f on f.id = z.floor_id
    join public.buildings b on b.id = f.building_id
    where z.id = spaces.zone_id
      and public.has_project_permission(b.project_id, 'structure.manage')
  ))
  with check (exists (
    select 1 from public.zones z
    join public.floors f on f.id = z.floor_id
    join public.buildings b on b.id = f.building_id
    where z.id = spaces.zone_id
      and public.has_project_permission(b.project_id, 'structure.manage')
  ));

create policy spaces_delete on public.spaces
  for delete to authenticated
  using (exists (
    select 1 from public.zones z
    join public.floors f on f.id = z.floor_id
    join public.buildings b on b.id = f.building_id
    where z.id = spaces.zone_id
      and public.has_project_permission(b.project_id, 'structure.manage')
  ));

-- -----------------------------------------------------------------------------
-- 5. Trades and classification rules
-- -----------------------------------------------------------------------------
create policy trades_read on public.trades
  for select to authenticated
  using (is_system or org_id in (select public.current_org_ids()));

create policy trades_insert on public.trades
  for insert to authenticated
  with check (not is_system and public.has_permission(org_id, 'org.manage'));

create policy trades_update on public.trades
  for update to authenticated
  using (not is_system and public.has_permission(org_id, 'org.manage'))
  with check (not is_system and public.has_permission(org_id, 'org.manage'));

create policy trades_delete on public.trades
  for delete to authenticated
  using (not is_system and public.has_permission(org_id, 'org.manage'));

create policy classification_rules_read on public.classification_rules
  for select to authenticated
  using (org_id in (select public.current_org_ids()));

create policy classification_rules_insert on public.classification_rules
  for insert to authenticated
  with check (public.has_permission(org_id, 'layer.update'));

create policy classification_rules_update on public.classification_rules
  for update to authenticated
  using (public.has_permission(org_id, 'layer.update'))
  with check (public.has_permission(org_id, 'layer.update'));

create policy classification_rules_delete on public.classification_rules
  for delete to authenticated
  using (public.has_permission(org_id, 'layer.update'));

-- -----------------------------------------------------------------------------
-- 6. Plans and layers
-- -----------------------------------------------------------------------------
create policy plans_read on public.plans
  for select to authenticated
  using (public.has_project_permission(project_id, 'plan.read'));

create policy plans_insert on public.plans
  for insert to authenticated
  with check (public.has_project_permission(project_id, 'plan.upload'));

create policy plans_update on public.plans
  for update to authenticated
  using (public.has_project_permission(project_id, 'plan.upload'))
  with check (public.has_project_permission(project_id, 'plan.upload'));

create policy plans_delete on public.plans
  for delete to authenticated
  using (public.has_project_permission(project_id, 'plan.delete'));

create policy plan_layers_read on public.plan_layers
  for select to authenticated
  using (exists (
    select 1 from public.plans p
    where p.id = plan_layers.plan_id
      and public.has_project_permission(p.project_id, 'layer.read')
  ));

-- A recipient sees only the layers their package explicitly lists. Not the
-- layers of the trade, not the layers of the floor — the listed rows.
create policy plan_layers_recipient_read on public.plan_layers
  for select to authenticated
  using (exists (
    select 1 from public.work_package_layers wpl
    where wpl.plan_layer_id = plan_layers.id
      and public.recipient_can(wpl.work_package_id, 'drawings')
  ));

create policy plan_layers_update on public.plan_layers
  for update to authenticated
  using (exists (
    select 1 from public.plans p
    where p.id = plan_layers.plan_id
      and public.has_project_permission(p.project_id, 'layer.update')
  ))
  with check (exists (
    select 1 from public.plans p
    where p.id = plan_layers.plan_id
      and public.has_project_permission(p.project_id, 'layer.update')
  ));

create policy plan_entities_read on public.plan_entities
  for select to authenticated
  using (exists (
    select 1 from public.plans p
    where p.id = plan_entities.plan_id
      and public.has_project_permission(p.project_id, 'layer.read')
  ));

-- Recipients read raw geometry only for layers in their package, which is what
-- lets the portal draw the plan client-side without ever shipping the file.
create policy plan_entities_recipient_read on public.plan_entities
  for select to authenticated
  using (exists (
    select 1
    from public.work_package_layers wpl
    join public.plan_layers pl on pl.id = wpl.plan_layer_id
    where pl.plan_id = plan_entities.plan_id
      and pl.source_key = plan_entities.layer_key
      and public.recipient_can(wpl.work_package_id, 'drawings')
  ));

create policy parse_jobs_read on public.parse_jobs
  for select to authenticated
  using (exists (
    select 1 from public.plans p
    where p.id = parse_jobs.plan_id
      and public.has_project_permission(p.project_id, 'plan.read')
  ));

-- -----------------------------------------------------------------------------
-- 7. Quantities
-- -----------------------------------------------------------------------------
create policy quantity_lines_read on public.quantity_lines
  for select to authenticated
  using (public.has_project_permission(project_id, 'quantity.read'));

create policy quantity_lines_recipient_read on public.quantity_lines
  for select to authenticated
  using (exists (
    select 1 from public.work_package_lines wpl
    where wpl.quantity_line_id = quantity_lines.id
      and public.recipient_can(wpl.work_package_id, 'quantities')
  ));

create policy quantity_lines_insert on public.quantity_lines
  for insert to authenticated
  with check (public.has_project_permission(project_id, 'quantity.update'));

create policy quantity_lines_update on public.quantity_lines
  for update to authenticated
  using (public.has_project_permission(project_id, 'quantity.update'))
  with check (public.has_project_permission(project_id, 'quantity.update'));

create policy quantity_lines_delete on public.quantity_lines
  for delete to authenticated
  using (public.has_project_permission(project_id, 'quantity.update'));

-- -----------------------------------------------------------------------------
-- 8. Money
-- -----------------------------------------------------------------------------
create policy price_books_read on public.price_books
  for select to authenticated
  using (public.has_permission(org_id, 'price.cost.read'));

create policy price_books_insert on public.price_books
  for insert to authenticated
  with check (public.has_permission(org_id, 'price.update'));

create policy price_books_update on public.price_books
  for update to authenticated
  using (public.has_permission(org_id, 'price.update'))
  with check (public.has_permission(org_id, 'price.update'));

create policy price_books_delete on public.price_books
  for delete to authenticated
  using (public.has_permission(org_id, 'price.update'));

create policy price_items_read on public.price_items
  for select to authenticated
  using (exists (
    select 1 from public.price_books pb
    where pb.id = price_items.price_book_id
      and public.has_permission(pb.org_id, 'price.cost.read')
  ));

create policy price_items_insert on public.price_items
  for insert to authenticated
  with check (exists (
    select 1 from public.price_books pb
    where pb.id = price_items.price_book_id
      and public.has_permission(pb.org_id, 'price.update')
  ));

create policy price_items_update on public.price_items
  for update to authenticated
  using (exists (
    select 1 from public.price_books pb
    where pb.id = price_items.price_book_id
      and public.has_permission(pb.org_id, 'price.update')
  ))
  with check (exists (
    select 1 from public.price_books pb
    where pb.id = price_items.price_book_id
      and public.has_permission(pb.org_id, 'price.update')
  ));

create policy price_items_delete on public.price_items
  for delete to authenticated
  using (exists (
    select 1 from public.price_books pb
    where pb.id = price_items.price_book_id
      and public.has_permission(pb.org_id, 'price.update')
  ));

create policy quotes_read on public.quotes
  for select to authenticated
  using (public.has_project_permission(project_id, 'quote.read'));

create policy quotes_insert on public.quotes
  for insert to authenticated
  with check (public.has_project_permission(project_id, 'quote.create'));

create policy quotes_update on public.quotes
  for update to authenticated
  using (public.has_project_permission(project_id, 'quote.create'))
  with check (public.has_project_permission(project_id, 'quote.create'));

create policy quotes_delete on public.quotes
  for delete to authenticated
  using (public.has_project_permission(project_id, 'quote.create'));

create policy quote_lines_read on public.quote_lines
  for select to authenticated
  using (exists (
    select 1 from public.quotes q
    where q.id = quote_lines.quote_id
      and public.has_project_permission(q.project_id, 'quote.read')
  ));

create policy quote_lines_insert on public.quote_lines
  for insert to authenticated
  with check (exists (
    select 1 from public.quotes q
    where q.id = quote_lines.quote_id
      and public.has_project_permission(q.project_id, 'quote.create')
  ));

create policy quote_lines_update on public.quote_lines
  for update to authenticated
  using (exists (
    select 1 from public.quotes q
    where q.id = quote_lines.quote_id
      and public.has_project_permission(q.project_id, 'quote.create')
  ))
  with check (exists (
    select 1 from public.quotes q
    where q.id = quote_lines.quote_id
      and public.has_project_permission(q.project_id, 'quote.create')
  ));

create policy quote_lines_delete on public.quote_lines
  for delete to authenticated
  using (exists (
    select 1 from public.quotes q
    where q.id = quote_lines.quote_id
      and public.has_project_permission(q.project_id, 'quote.create')
  ));

-- The margin sheet. One permission, no recipient path, no exceptions.
create policy quote_line_costs_read on public.quote_line_costs
  for select to authenticated
  using (exists (
    select 1
    from public.quote_lines ql
    join public.quotes q on q.id = ql.quote_id
    where ql.id = quote_line_costs.quote_line_id
      and public.has_project_permission(q.project_id, 'price.cost.read')
  ));

create policy quote_line_costs_insert on public.quote_line_costs
  for insert to authenticated
  with check (exists (
    select 1
    from public.quote_lines ql
    join public.quotes q on q.id = ql.quote_id
    where ql.id = quote_line_costs.quote_line_id
      and public.has_project_permission(q.project_id, 'price.update')
  ));

create policy quote_line_costs_update on public.quote_line_costs
  for update to authenticated
  using (exists (
    select 1
    from public.quote_lines ql
    join public.quotes q on q.id = ql.quote_id
    where ql.id = quote_line_costs.quote_line_id
      and public.has_project_permission(q.project_id, 'price.update')
  ))
  with check (exists (
    select 1
    from public.quote_lines ql
    join public.quotes q on q.id = ql.quote_id
    where ql.id = quote_line_costs.quote_line_id
      and public.has_project_permission(q.project_id, 'price.update')
  ));

create policy quote_line_costs_delete on public.quote_line_costs
  for delete to authenticated
  using (exists (
    select 1
    from public.quote_lines ql
    join public.quotes q on q.id = ql.quote_id
    where ql.id = quote_line_costs.quote_line_id
      and public.has_project_permission(q.project_id, 'price.update')
  ));

-- -----------------------------------------------------------------------------
-- 9. Packages, recipients, bids
-- -----------------------------------------------------------------------------
create policy parties_read on public.parties
  for select to authenticated
  using (org_id in (select public.current_org_ids()));

create policy parties_insert on public.parties
  for insert to authenticated
  with check (public.has_permission(org_id, 'package.create'));

create policy parties_update on public.parties
  for update to authenticated
  using (public.has_permission(org_id, 'package.create'))
  with check (public.has_permission(org_id, 'package.create'));

create policy parties_delete on public.parties
  for delete to authenticated
  using (public.has_permission(org_id, 'package.create'));

create policy work_packages_read on public.work_packages
  for select to authenticated
  using (public.has_project_permission(project_id, 'package.read')
      or id in (select public.recipient_package_ids()));

create policy work_packages_insert on public.work_packages
  for insert to authenticated
  with check (public.has_project_permission(project_id, 'package.create'));

create policy work_packages_update on public.work_packages
  for update to authenticated
  using (public.has_project_permission(project_id, 'package.create'))
  with check (public.has_project_permission(project_id, 'package.create'));

create policy work_packages_delete on public.work_packages
  for delete to authenticated
  using (public.has_project_permission(project_id, 'package.create'));

create policy work_package_lines_read on public.work_package_lines
  for select to authenticated
  using (
    work_package_id in (select public.recipient_package_ids())
    or exists (
      select 1 from public.work_packages wp
      where wp.id = work_package_lines.work_package_id
        and public.has_project_permission(wp.project_id, 'package.read')
    )
  );

create policy work_package_lines_insert on public.work_package_lines
  for insert to authenticated
  with check (exists (
    select 1 from public.work_packages wp
    where wp.id = work_package_lines.work_package_id
      and public.has_project_permission(wp.project_id, 'package.create')
  ));

create policy work_package_lines_update on public.work_package_lines
  for update to authenticated
  using (exists (
    select 1 from public.work_packages wp
    where wp.id = work_package_lines.work_package_id
      and public.has_project_permission(wp.project_id, 'package.create')
  ))
  with check (exists (
    select 1 from public.work_packages wp
    where wp.id = work_package_lines.work_package_id
      and public.has_project_permission(wp.project_id, 'package.create')
  ));

create policy work_package_lines_delete on public.work_package_lines
  for delete to authenticated
  using (exists (
    select 1 from public.work_packages wp
    where wp.id = work_package_lines.work_package_id
      and public.has_project_permission(wp.project_id, 'package.create')
  ));

create policy work_package_layers_read on public.work_package_layers
  for select to authenticated
  using (
    work_package_id in (select public.recipient_package_ids())
    or exists (
      select 1 from public.work_packages wp
      where wp.id = work_package_layers.work_package_id
        and public.has_project_permission(wp.project_id, 'package.read')
    )
  );

create policy work_package_layers_insert on public.work_package_layers
  for insert to authenticated
  with check (exists (
    select 1 from public.work_packages wp
    where wp.id = work_package_layers.work_package_id
      and public.has_project_permission(wp.project_id, 'package.create')
  ));

create policy work_package_layers_update on public.work_package_layers
  for update to authenticated
  using (exists (
    select 1 from public.work_packages wp
    where wp.id = work_package_layers.work_package_id
      and public.has_project_permission(wp.project_id, 'package.create')
  ))
  with check (exists (
    select 1 from public.work_packages wp
    where wp.id = work_package_layers.work_package_id
      and public.has_project_permission(wp.project_id, 'package.create')
  ));

create policy work_package_layers_delete on public.work_package_layers
  for delete to authenticated
  using (exists (
    select 1 from public.work_packages wp
    where wp.id = work_package_layers.work_package_id
      and public.has_project_permission(wp.project_id, 'package.create')
  ));

-- A recipient sees their own row and nobody else's — they must not be able to
-- enumerate who else was invited to bid.
create policy package_recipients_self_read on public.package_recipients
  for select to authenticated
  using (user_id = auth.uid());

create policy package_recipients_org_read on public.package_recipients
  for select to authenticated
  using (exists (
    select 1 from public.work_packages wp
    where wp.id = package_recipients.work_package_id
      and public.has_project_permission(wp.project_id, 'package.read')
  ));

create policy package_recipients_insert on public.package_recipients
  for insert to authenticated
  with check (exists (
    select 1 from public.work_packages wp
    where wp.id = package_recipients.work_package_id
      and public.has_project_permission(wp.project_id, 'package.send')
  ));

create policy package_recipients_update on public.package_recipients
  for update to authenticated
  using (exists (
    select 1 from public.work_packages wp
    where wp.id = package_recipients.work_package_id
      and public.has_project_permission(wp.project_id, 'package.send')
  ))
  with check (exists (
    select 1 from public.work_packages wp
    where wp.id = package_recipients.work_package_id
      and public.has_project_permission(wp.project_id, 'package.send')
  ));

create policy package_recipients_delete on public.package_recipients
  for delete to authenticated
  using (exists (
    select 1 from public.work_packages wp
    where wp.id = package_recipients.work_package_id
      and public.has_project_permission(wp.project_id, 'package.send')
  ));

create policy package_renders_read on public.package_renders
  for select to authenticated
  using (
    exists (
      select 1 from public.package_recipients r
      where r.id = package_renders.recipient_id and r.user_id = auth.uid()
    )
    or exists (
      select 1 from public.work_packages wp
      where wp.id = package_renders.work_package_id
        and public.has_project_permission(wp.project_id, 'package.read')
    )
  );

-- Bids: the bidder owns their own row until it is submitted.
create policy bids_self_read on public.bids
  for select to authenticated
  using (exists (
    select 1 from public.package_recipients r
    where r.id = bids.recipient_id and r.user_id = auth.uid()
  ));

create policy bids_self_insert on public.bids
  for insert to authenticated
  with check (exists (
    select 1 from public.package_recipients r
    where r.id = bids.recipient_id
      and r.user_id = auth.uid()
      and (r.access_expires_at is null or r.access_expires_at > now())
  ));

create policy bids_self_update on public.bids
  for update to authenticated
  using (exists (
    select 1 from public.package_recipients r
    where r.id = bids.recipient_id
      and r.user_id = auth.uid()
      and (r.access_expires_at is null or r.access_expires_at > now())
  ))
  with check (exists (
    select 1 from public.package_recipients r
    where r.id = bids.recipient_id
      and r.user_id = auth.uid()
      and (r.access_expires_at is null or r.access_expires_at > now())
  ));

create policy bids_self_delete on public.bids
  for delete to authenticated
  using (exists (
    select 1 from public.package_recipients r
    where r.id = bids.recipient_id
      and r.user_id = auth.uid()
      and (r.access_expires_at is null or r.access_expires_at > now())
  ));

create policy bids_org_read on public.bids
  for select to authenticated
  using (exists (
    select 1 from public.work_packages wp
    where wp.id = bids.work_package_id
      and public.has_project_permission(wp.project_id, 'bid.read')
  ));

create policy bid_lines_self_insert on public.bid_lines
  for insert to authenticated
  with check (exists (
    select 1 from public.bids b
    join public.package_recipients r on r.id = b.recipient_id
    where b.id = bid_lines.bid_id
      and r.user_id = auth.uid()
      and (r.access_expires_at is null or r.access_expires_at > now())
  ));

create policy bid_lines_self_update on public.bid_lines
  for update to authenticated
  using (exists (
    select 1 from public.bids b
    join public.package_recipients r on r.id = b.recipient_id
    where b.id = bid_lines.bid_id
      and r.user_id = auth.uid()
      and (r.access_expires_at is null or r.access_expires_at > now())
  ))
  with check (exists (
    select 1 from public.bids b
    join public.package_recipients r on r.id = b.recipient_id
    where b.id = bid_lines.bid_id
      and r.user_id = auth.uid()
      and (r.access_expires_at is null or r.access_expires_at > now())
  ));

create policy bid_lines_self_delete on public.bid_lines
  for delete to authenticated
  using (exists (
    select 1 from public.bids b
    join public.package_recipients r on r.id = b.recipient_id
    where b.id = bid_lines.bid_id
      and r.user_id = auth.uid()
      and (r.access_expires_at is null or r.access_expires_at > now())
  ));

create policy bid_lines_self_read on public.bid_lines
  for select to authenticated
  using (exists (
    select 1
    from public.bids b
    join public.package_recipients r on r.id = b.recipient_id
    where b.id = bid_lines.bid_id and r.user_id = auth.uid()
  ));

create policy bid_lines_org_read on public.bid_lines
  for select to authenticated
  using (exists (
    select 1
    from public.bids b
    join public.work_packages wp on wp.id = b.work_package_id
    where b.id = bid_lines.bid_id
      and public.has_project_permission(wp.project_id, 'bid.read')
  ));

-- -----------------------------------------------------------------------------
-- 10. Function grants
--
-- `execute` is revoked from `public` first: a `security definer` function that
-- anyone can call is a privilege-escalation primitive, and the default grant is
-- to `public`.
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;

grant execute on function public.current_org_ids() to authenticated;
grant execute on function public.has_permission(uuid, public.app_permission) to authenticated;
grant execute on function public.has_project_permission(uuid, public.app_permission) to authenticated;
grant execute on function public.recipient_package_ids() to authenticated;
grant execute on function public.recipient_can(uuid, text) to authenticated;
grant execute on function public.create_invitation(uuid, citext, uuid, interval, public.app_permission[], public.app_permission[], timestamptz) to authenticated;
grant execute on function public.redeem_invitation(text) to authenticated;
grant execute on function public.approve_membership(uuid, uuid, public.app_permission[], public.app_permission[]) to authenticated;
grant execute on function public.billable_quantity(public.quantity_lines) to authenticated;

grant insert, update, delete on
  public.projects, public.buildings, public.floors, public.zones, public.spaces,
  public.plans, public.plan_layers, public.quantity_lines,
  public.trades, public.classification_rules,
  public.price_books, public.price_items,
  public.quotes, public.quote_lines, public.quote_line_costs,
  public.parties, public.work_packages, public.work_package_lines,
  public.work_package_layers, public.package_recipients,
  public.bids, public.bid_lines,
  public.roles, public.role_permissions, public.membership_permissions
to authenticated;

grant update on public.profiles, public.organizations, public.memberships, public.invitations to authenticated;
grant usage on all sequences in schema public to authenticated;
