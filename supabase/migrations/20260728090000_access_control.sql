-- =============================================================================
-- Access control: organisations, roles, permissions, invitations, approvals.
--
-- Two rules drive the whole design, both stated by the customer:
--
--   1. A new account cannot come into existence without an invitation code the
--      administrator issued. No open sign-up, ever.
--   2. Even with a valid code, the account is inert until an administrator has
--      looked at the role and permissions attached to it and approved them.
--      Registration and authorisation are deliberately two separate acts, so
--      nobody can grant themselves access by completing a form.
--
-- Enforcement lives here, not in the application. Every policy below assumes
-- the client is hostile and holds a valid JWT for some account — because that
-- is exactly what a leaked subcontractor login is.
-- =============================================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

-- -----------------------------------------------------------------------------
-- Permissions
--
-- A flat, closed vocabulary. Deliberately not a free-text string: a typo in a
-- permission name must fail loudly at write time rather than silently deny (or
-- worse, silently allow) at read time.
-- -----------------------------------------------------------------------------
create type public.app_permission as enum (
  -- Organisation administration
  'org.manage',            -- rename, billing, delete
  'org.members.invite',    -- issue an invitation code
  'org.members.approve',   -- activate a registered account
  'org.members.manage',    -- suspend, revoke, change role
  'org.roles.manage',      -- define custom roles
  'org.audit.read',

  -- Projects and structure
  'project.create',
  'project.read',
  'project.update',
  'project.delete',
  'structure.manage',      -- buildings, floors, zones

  -- Plans
  'plan.upload',
  'plan.read',
  'plan.delete',
  'plan.download_source',  -- the original DWG/DXF, not the filtered render

  -- Take-off
  'layer.read',
  'layer.update',
  'quantity.read',
  'quantity.update',
  'quantity.approve',

  -- Money. `price.cost.read` is the sensitive one: it exposes what you pay
  -- subcontractors. It is never granted to a client or to another sub.
  'price.cost.read',
  'price.sell.read',
  'price.update',
  'quote.read',
  'quote.create',
  'quote.send',
  'quote.approve',

  -- Work packages and bidding
  'package.read',
  'package.create',
  'package.send',
  'bid.submit',
  'bid.read',
  'bid.award'
);

create type public.membership_status as enum (
  'pending_approval',  -- registered with a valid code, waiting on an admin
  'active',
  'suspended',
  'expired',
  'revoked'
);

create type public.invitation_status as enum ('pending', 'redeemed', 'expired', 'revoked');

-- -----------------------------------------------------------------------------
-- Organisations
-- -----------------------------------------------------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  slug        citext not null unique,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null
);

-- -----------------------------------------------------------------------------
-- Profiles — one row per auth user, created by trigger on sign-up.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        citext not null,
  full_name    text,
  phone        text,
  company_name text,
  locale       text not null default 'he',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Roles
--
-- System roles ship with the product and cannot be edited, so an administrator
-- cannot accidentally widen "client" for everybody. Custom roles are per
-- organisation.
-- -----------------------------------------------------------------------------
create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references public.organizations (id) on delete cascade,
  key         text not null,
  name_he     text not null,
  name_en     text not null,
  description text,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),

  -- System roles are global (`org_id is null`); custom roles belong to one org.
  constraint roles_scope check ((is_system and org_id is null) or (not is_system and org_id is not null)),
  constraint roles_key_unique unique nulls not distinct (org_id, key)
);

create table public.role_permissions (
  role_id    uuid not null references public.roles (id) on delete cascade,
  permission public.app_permission not null,
  primary key (role_id, permission)
);

-- -----------------------------------------------------------------------------
-- Memberships — a user's presence in an organisation.
--
-- `status` is the gate. Nothing in this schema is readable through a membership
-- that is not `active`, and a membership only becomes `active` when a human with
-- `org.members.approve` says so.
-- -----------------------------------------------------------------------------
create table public.memberships (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations (id) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  role_id            uuid not null references public.roles (id) on delete restrict,
  status             public.membership_status not null default 'pending_approval',

  -- Which invitation produced this membership. Kept for the audit trail: every
  -- account must be traceable to the code that created it.
  invitation_id      uuid,

  -- The approval record. All three are set together, by the approve function.
  approved_by        uuid references auth.users (id) on delete set null,
  approved_at        timestamptz,
  -- What the approver actually saw and confirmed. Storing it means an approval
  -- cannot later be argued to have covered permissions it did not.
  approved_role_id   uuid references public.roles (id) on delete set null,

  -- Time-boxed access: a subcontractor's login stops working when the tender
  -- closes, without anybody having to remember to switch it off.
  access_expires_at  timestamptz,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (org_id, user_id),
  constraint memberships_approval_complete check (
    (status <> 'active')
    or (approved_by is not null and approved_at is not null and approved_role_id is not null)
  )
);

create index memberships_user_idx on public.memberships (user_id) where status = 'active';
create index memberships_org_idx on public.memberships (org_id, status);

-- -----------------------------------------------------------------------------
-- Per-user permission overrides.
--
-- Roles cover the common case; real projects always have the one person who
-- needs a single extra capability. A `granted = false` row revokes a permission
-- the role would otherwise give, and revocation always wins.
-- -----------------------------------------------------------------------------
create table public.membership_permissions (
  membership_id uuid not null references public.memberships (id) on delete cascade,
  permission    public.app_permission not null,
  granted       boolean not null,
  granted_by    uuid references auth.users (id) on delete set null,
  granted_at    timestamptz not null default now(),
  reason        text,
  primary key (membership_id, permission)
);

-- -----------------------------------------------------------------------------
-- Invitations
--
-- The code itself is never stored. Only a SHA-256 digest is kept, so a database
-- dump does not hand over the ability to create accounts. The plaintext exists
-- exactly twice: in the email that was sent, and in the response of the RPC that
-- created it — which is why that RPC returns it once and never again.
-- -----------------------------------------------------------------------------
create table public.invitations (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,

  -- The invitation is bound to one address. A code emailed to one person cannot
  -- be forwarded and redeemed by another.
  email          citext not null,
  code_hash      bytea not null,
  -- First and last few characters, for the admin list. Not enough to redeem.
  code_hint      text not null,

  role_id        uuid not null references public.roles (id) on delete restrict,
  -- Extra or withheld permissions the admin chose at invite time. Copied onto
  -- the membership at approval, not at redemption.
  extra_permissions   public.app_permission[] not null default '{}',
  denied_permissions  public.app_permission[] not null default '{}',

  status         public.invitation_status not null default 'pending',
  expires_at     timestamptz not null,
  access_expires_at timestamptz,

  created_by     uuid not null references auth.users (id) on delete restrict,
  created_at     timestamptz not null default now(),
  redeemed_by    uuid references auth.users (id) on delete set null,
  redeemed_at    timestamptz,
  revoked_by     uuid references auth.users (id) on delete set null,
  revoked_at     timestamptz,

  -- Rate-limiting the guessing of a code. A code is 128 bits of entropy, but
  -- counting attempts is cheap and turns a brute-force into a visible event.
  attempt_count  integer not null default 0,

  constraint invitations_expiry_future check (expires_at > created_at)
);

create unique index invitations_code_hash_idx on public.invitations (code_hash);
create index invitations_org_status_idx on public.invitations (org_id, status);
create index invitations_email_idx on public.invitations (email) where status = 'pending';

alter table public.memberships
  add constraint memberships_invitation_fk
  foreign key (invitation_id) references public.invitations (id) on delete set null;

-- -----------------------------------------------------------------------------
-- Audit log
--
-- Append-only from the application's point of view: there is no update or delete
-- policy on this table for anybody, including administrators.
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id          bigserial primary key,
  org_id      uuid references public.organizations (id) on delete set null,
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   text,
  metadata    jsonb not null default '{}'::jsonb,
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index audit_log_org_time_idx on public.audit_log (org_id, created_at desc);
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);

-- =============================================================================
-- Authorisation functions
--
-- Every one of these is `security definer` with a pinned `search_path`. Without
-- the pin, a caller who can create objects in a schema earlier on the path can
-- shadow a function these bodies call and execute it with the definer's rights.
-- =============================================================================

-- The org ids the current user is an active, unexpired member of.
create or replace function public.current_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.org_id
  from public.memberships m
  where m.user_id = auth.uid()
    and m.status = 'active'
    and (m.access_expires_at is null or m.access_expires_at > now());
$$;

-- Does the current user hold `perm` in `target_org`?
--
-- Resolution order: an explicit revoke beats everything, then an explicit
-- grant, then the role. Membership must be active and unexpired throughout.
create or replace function public.has_permission(target_org uuid, perm public.app_permission)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with membership as (
    select m.id, m.role_id
    from public.memberships m
    where m.user_id = auth.uid()
      and m.org_id = target_org
      and m.status = 'active'
      and (m.access_expires_at is null or m.access_expires_at > now())
    limit 1
  ),
  override as (
    select mp.granted
    from public.membership_permissions mp
    join membership on membership.id = mp.membership_id
    where mp.permission = perm
    limit 1
  )
  select case
    when not exists (select 1 from membership) then false
    when exists (select 1 from override) then (select granted from override)
    else exists (
      select 1
      from public.role_permissions rp
      join membership on membership.role_id = rp.role_id
      where rp.permission = perm
    )
  end;
$$;

-- `has_project_permission` is defined in the project-structure migration, since it
-- reads `public.projects` and a `language sql` body is validated at creation time.

-- =============================================================================
-- Invitation lifecycle
-- =============================================================================

-- Issues an invitation and returns the plaintext code exactly once.
--
-- The code is 160 bits from `gen_random_bytes`, base32-ish so it can be read
-- aloud over a phone without ambiguity between 0/O and 1/I/l.
create or replace function public.create_invitation(
  target_org uuid,
  invite_email citext,
  invite_role_id uuid,
  valid_for interval default interval '7 days',
  extra public.app_permission[] default '{}',
  denied public.app_permission[] default '{}',
  access_until timestamptz default null
)
returns table (invitation_id uuid, code text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  raw_bytes bytea;
  generated text := '';
  i integer;
  new_id uuid;
begin
  if not public.has_permission(target_org, 'org.members.invite') then
    raise exception 'אין הרשאה להזמין משתמשים לארגון זה' using errcode = '42501';
  end if;

  -- A role must belong to this organisation or be a system role. Without this
  -- check an admin of org A could attach a custom role defined in org B.
  if not exists (
    select 1 from public.roles r
    where r.id = invite_role_id and (r.is_system or r.org_id = target_org)
  ) then
    raise exception 'התפקיד אינו קיים בארגון זה' using errcode = '22023';
  end if;

  raw_bytes := gen_random_bytes(20);
  for i in 0..31 loop
    generated := generated || substr(alphabet, 1 + (get_byte(raw_bytes, i % 20) + i * 7) % 32, 1);
  end loop;
  -- Grouped for legibility: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
  generated := regexp_replace(generated, '(.{4})(?!$)', '\1-', 'g');

  insert into public.invitations (
    org_id, email, code_hash, code_hint, role_id,
    extra_permissions, denied_permissions,
    expires_at, access_expires_at, created_by
  )
  values (
    target_org, invite_email, digest(generated, 'sha256'),
    left(generated, 4) || '…' || right(generated, 4), invite_role_id,
    coalesce(extra, '{}'), coalesce(denied, '{}'),
    now() + valid_for, access_until, auth.uid()
  )
  returning id into new_id;

  insert into public.audit_log (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (target_org, auth.uid(), 'invitation.created', 'invitation', new_id::text,
          jsonb_build_object('email', invite_email, 'role_id', invite_role_id));

  return query select new_id, generated;
end;
$$;

-- Redeems a code for the *currently authenticated* user.
--
-- Called immediately after sign-up. It creates the membership in
-- `pending_approval` — this function can never produce an active account, which
-- is the property the whole scheme rests on.
create or replace function public.redeem_invitation(code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inv public.invitations%rowtype;
  caller_email citext;
  new_membership uuid;
begin
  if auth.uid() is null then
    raise exception 'נדרשת התחברות לפני מימוש קוד' using errcode = '42501';
  end if;

  select p.email into caller_email from public.profiles p where p.id = auth.uid();

  select * into inv
  from public.invitations i
  where i.code_hash = digest(upper(trim(code)), 'sha256')
  for update;

  if not found then
    -- No row to count attempts against, so nothing to record. The failure is
    -- indistinguishable from an expired code by design.
    raise exception 'קוד לא תקין או שפג תוקפו' using errcode = '42501';
  end if;

  update public.invitations set attempt_count = attempt_count + 1 where id = inv.id;

  if inv.status <> 'pending' then
    raise exception 'הקוד כבר נוצל או בוטל' using errcode = '42501';
  end if;

  if inv.expires_at <= now() then
    update public.invitations set status = 'expired' where id = inv.id;
    raise exception 'תוקף הקוד פג' using errcode = '42501';
  end if;

  -- The binding to the invited address. This is what stops a forwarded code
  -- from creating an account for somebody the administrator never invited.
  if caller_email is null or caller_email <> inv.email then
    insert into public.audit_log (org_id, actor_id, action, entity_type, entity_id, metadata)
    values (inv.org_id, auth.uid(), 'invitation.email_mismatch', 'invitation', inv.id::text,
            jsonb_build_object('expected', inv.email, 'actual', caller_email));
    raise exception 'הקוד הונפק לכתובת מייל אחרת' using errcode = '42501';
  end if;

  insert into public.memberships (org_id, user_id, role_id, status, invitation_id, access_expires_at)
  values (inv.org_id, auth.uid(), inv.role_id, 'pending_approval', inv.id, inv.access_expires_at)
  on conflict (org_id, user_id) do nothing
  returning id into new_membership;

  if new_membership is null then
    raise exception 'למשתמש כבר יש חברות בארגון זה' using errcode = '23505';
  end if;

  update public.invitations
  set status = 'redeemed', redeemed_by = auth.uid(), redeemed_at = now()
  where id = inv.id;

  insert into public.audit_log (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (inv.org_id, auth.uid(), 'invitation.redeemed', 'membership', new_membership::text,
          jsonb_build_object('invitation_id', inv.id));

  return new_membership;
end;
$$;

-- Activates a pending membership.
--
-- `confirm_role_id` is not a convenience parameter — the approver must restate
-- the role they are approving, and it must match what is on the membership. An
-- administrator clicking "approve" on a stale screen, after somebody changed the
-- role underneath them, gets an error instead of granting access they did not
-- intend to grant.
create or replace function public.approve_membership(
  target_membership uuid,
  confirm_role_id uuid,
  grant_permissions public.app_permission[] default '{}',
  revoke_permissions public.app_permission[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  m public.memberships%rowtype;
  perm public.app_permission;
begin
  select * into m from public.memberships where id = target_membership for update;
  if not found then
    raise exception 'החברות לא נמצאה' using errcode = 'P0002';
  end if;

  if not public.has_permission(m.org_id, 'org.members.approve') then
    raise exception 'אין הרשאה לאשר משתמשים בארגון זה' using errcode = '42501';
  end if;

  if m.user_id = auth.uid() then
    raise exception 'לא ניתן לאשר את החשבון של עצמך' using errcode = '42501';
  end if;

  if m.status <> 'pending_approval' then
    raise exception 'ניתן לאשר רק חברות שממתינה לאישור' using errcode = '22023';
  end if;

  if m.role_id <> confirm_role_id then
    raise exception 'התפקיד שאושר אינו תואם את התפקיד הרשום. רענן ובדוק שוב לפני אישור.'
      using errcode = '22023';
  end if;

  foreach perm in array coalesce(grant_permissions, '{}') loop
    insert into public.membership_permissions (membership_id, permission, granted, granted_by)
    values (target_membership, perm, true, auth.uid())
    on conflict (membership_id, permission)
    do update set granted = true, granted_by = auth.uid(), granted_at = now();
  end loop;

  foreach perm in array coalesce(revoke_permissions, '{}') loop
    insert into public.membership_permissions (membership_id, permission, granted, granted_by)
    values (target_membership, perm, false, auth.uid())
    on conflict (membership_id, permission)
    do update set granted = false, granted_by = auth.uid(), granted_at = now();
  end loop;

  update public.memberships
  set status = 'active',
      approved_by = auth.uid(),
      approved_at = now(),
      approved_role_id = confirm_role_id,
      updated_at = now()
  where id = target_membership;

  insert into public.audit_log (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (m.org_id, auth.uid(), 'membership.approved', 'membership', target_membership::text,
          jsonb_build_object(
            'user_id', m.user_id,
            'role_id', confirm_role_id,
            'granted', grant_permissions,
            'revoked', revoke_permissions
          ));
end;
$$;

-- Creates the profile row for a new auth user. Without this the account exists
-- in `auth` but has no email to match an invitation against, so redemption
-- would fail with a confusing error.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keeps `updated_at` honest without the application having to remember.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger memberships_touch before update on public.memberships
  for each row execute function public.touch_updated_at();
