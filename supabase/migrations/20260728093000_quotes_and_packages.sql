-- =============================================================================
-- Pricing, quotes, work packages, bids.
--
-- The commercial half of the system, and the half where a leak is expensive.
-- One structural decision governs it:
--
--   **Cost and sell prices live in different tables.**
--
-- Not different columns with a column-level grant — different tables, with
-- different policies. A client's session and a subcontractor's session can hold
-- `select` on `quote_lines` all day and still have no path to what anybody else
-- is being paid, because the cost figures are not in that relation at all. A
-- mistake in a policy predicate then leaks the wrong rows; it cannot leak the
-- wrong *columns*, which is the failure that ends a relationship.
-- =============================================================================

create type public.quote_status as enum (
  'draft', 'internal_review', 'sent', 'accepted', 'rejected', 'expired', 'superseded'
);

create type public.package_status as enum (
  'draft', 'sent', 'bidding', 'closed', 'awarded', 'cancelled'
);

create type public.bid_status as enum (
  'draft', 'submitted', 'under_review', 'shortlisted', 'awarded', 'rejected', 'withdrawn'
);

create type public.party_kind as enum (
  'subcontractor', 'supplier', 'client', 'architect', 'project_manager', 'consultant', 'other'
);

-- -----------------------------------------------------------------------------
-- Price book
-- -----------------------------------------------------------------------------
create table public.price_books (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  name        text not null,
  currency    text not null default 'ILS',
  is_default  boolean not null default false,
  effective_from date not null default current_date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (org_id, name)
);

create unique index price_books_one_default_idx on public.price_books (org_id) where is_default;

create table public.price_items (
  id            uuid primary key default gen_random_uuid(),
  price_book_id uuid not null references public.price_books (id) on delete cascade,
  trade_id      uuid references public.trades (id) on delete set null,
  code          text,                       -- מספר סעיף בכתב הכמויות
  description   text not null,
  unit          text not null,

  -- What it costs you.
  cost_price    numeric(14, 4) check (cost_price >= 0),
  -- Default margin applied when this item is pulled into a quote.
  default_margin numeric(5, 4) not null default 0.15 check (default_margin >= 0 and default_margin < 5),

  -- Density, for the one measurement geometry cannot produce: weight.
  density_kg_per_m3 numeric(10, 3) check (density_kg_per_m3 > 0),

  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (price_book_id, code)
);

create index price_items_book_idx on public.price_items (price_book_id, trade_id);

-- -----------------------------------------------------------------------------
-- Quotes
--
-- Versioned by creation, never by mutation. A sent quote is a document somebody
-- may act on; editing it in place would make the record of what was sent
-- unrecoverable.
-- -----------------------------------------------------------------------------
create table public.quotes (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  version       integer not null default 1,
  status        public.quote_status not null default 'draft',
  title         text not null,
  notes         text,
  terms         text,

  currency      text not null default 'ILS',
  vat_rate      numeric(5, 4) not null default 0.18,
  discount_rate numeric(5, 4) not null default 0 check (discount_rate >= 0 and discount_rate < 1),

  valid_until   date,
  supersedes_quote_id uuid references public.quotes (id) on delete set null,

  sent_at       timestamptz,
  sent_to_email citext,
  decided_at    timestamptz,

  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (project_id, version)
);

create index quotes_project_idx on public.quotes (project_id, status);

-- Client-facing lines. Sell price only.
create table public.quote_lines (
  id              uuid primary key default gen_random_uuid(),
  quote_id        uuid not null references public.quotes (id) on delete cascade,
  quantity_line_id uuid references public.quantity_lines (id) on delete set null,
  trade_id        uuid references public.trades (id) on delete set null,

  building_id     uuid references public.buildings (id) on delete set null,
  floor_id        uuid references public.floors (id) on delete set null,
  zone_id         uuid references public.zones (id) on delete set null,

  section         text,                     -- פרק בכתב הכמויות
  code            text,
  description     text not null,
  unit            text not null,
  quantity        numeric(18, 6) not null,
  unit_price      numeric(14, 4) not null check (unit_price >= 0),

  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index quote_lines_quote_idx on public.quote_lines (quote_id, sort_order);

-- Internal margin sheet. Same rows, the other half of the numbers.
--
-- One row per quote line, in its own table with its own policy. Nothing that
-- reaches a client or a subcontractor selects from here.
create table public.quote_line_costs (
  quote_line_id uuid primary key references public.quote_lines (id) on delete cascade,
  cost_price    numeric(14, 4) not null default 0 check (cost_price >= 0),
  -- Where the cost came from: a price book, a subcontractor's bid, or a guess.
  cost_source   text not null default 'price_book'
                  check (cost_source in ('price_book', 'bid', 'manual')),
  source_bid_id uuid,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Parties — the companies you work with. Not users; a party may have several
-- logins or none yet.
-- -----------------------------------------------------------------------------
create table public.parties (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  kind          public.party_kind not null default 'subcontractor',
  name          text not null,
  contact_name  text,
  email         citext,
  phone         text,
  tax_id        text,                       -- ח.פ. / ע.מ.
  -- Which trades this party works in. Drives who is offered a package.
  trade_ids     uuid[] not null default '{}',
  notes         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (org_id, name)
);

create index parties_org_kind_idx on public.parties (org_id, kind) where is_active;

-- -----------------------------------------------------------------------------
-- Work packages — the slice of the job one party is asked to price.
-- -----------------------------------------------------------------------------
create table public.work_packages (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  trade_id      uuid references public.trades (id) on delete set null,
  name          text not null,
  description   text,
  status        public.package_status not null default 'draft',

  -- Scope, as structure rather than prose. Empty means "the whole project".
  building_ids  uuid[] not null default '{}',
  floor_ids     uuid[] not null default '{}',
  zone_ids      uuid[] not null default '{}',

  bids_due_at   timestamptz,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index work_packages_project_idx on public.work_packages (project_id, status);

-- Which quantity lines are in the package. Explicit rather than derived from a
-- filter: the recipient must see a fixed scope, and a filter would silently
-- change what they were asked to price when data around it changed.
create table public.work_package_lines (
  work_package_id  uuid not null references public.work_packages (id) on delete cascade,
  quantity_line_id uuid not null references public.quantity_lines (id) on delete cascade,
  sort_order       integer not null default 0,
  primary key (work_package_id, quantity_line_id)
);

-- Which layers the recipient may see on the drawing. The worker renders a new
-- file containing only these — the original is never handed over.
create table public.work_package_layers (
  work_package_id uuid not null references public.work_packages (id) on delete cascade,
  plan_layer_id   uuid not null references public.plan_layers (id) on delete cascade,
  primary key (work_package_id, plan_layer_id)
);

-- The filtered, watermarked drawing produced for one recipient.
create table public.package_renders (
  id              uuid primary key default gen_random_uuid(),
  work_package_id uuid not null references public.work_packages (id) on delete cascade,
  recipient_id    uuid,
  plan_id         uuid not null references public.plans (id) on delete cascade,
  storage_path    text not null,
  format          text not null default 'pdf' check (format in ('pdf', 'svg')),
  -- The recipient's company name, burned into the render. If the file turns up
  -- somewhere it should not be, it says who had it.
  watermark_text  text not null,
  created_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Recipients — the join between a package, a party, and a login.
--
-- This row *is* the access grant. RLS for the whole supplier portal resolves
-- through it, so revoking access is deleting or expiring one row.
-- -----------------------------------------------------------------------------
create table public.package_recipients (
  id              uuid primary key default gen_random_uuid(),
  work_package_id uuid not null references public.work_packages (id) on delete cascade,
  party_id        uuid not null references public.parties (id) on delete cascade,
  -- Null until the invited person has completed sign-up and been approved.
  user_id         uuid references auth.users (id) on delete set null,
  invitation_id   uuid references public.invitations (id) on delete set null,

  can_see_quantities boolean not null default true,
  can_see_drawings   boolean not null default true,
  can_download       boolean not null default false,

  access_expires_at timestamptz,
  sent_at         timestamptz,
  first_viewed_at timestamptz,
  last_viewed_at  timestamptz,
  view_count      integer not null default 0,

  created_at      timestamptz not null default now(),

  unique (work_package_id, party_id)
);

create index package_recipients_user_idx on public.package_recipients (user_id)
  where user_id is not null;

alter table public.package_renders
  add constraint package_renders_recipient_fk
  foreign key (recipient_id) references public.package_recipients (id) on delete cascade;

-- -----------------------------------------------------------------------------
-- Bids
-- -----------------------------------------------------------------------------
create table public.bids (
  id              uuid primary key default gen_random_uuid(),
  work_package_id uuid not null references public.work_packages (id) on delete cascade,
  recipient_id    uuid not null references public.package_recipients (id) on delete cascade,
  status          public.bid_status not null default 'draft',
  currency        text not null default 'ILS',
  notes           text,
  validity_days   integer check (validity_days > 0),
  lead_time_days  integer check (lead_time_days >= 0),
  submitted_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (work_package_id, recipient_id)
);

create table public.bid_lines (
  id               uuid primary key default gen_random_uuid(),
  bid_id           uuid not null references public.bids (id) on delete cascade,
  quantity_line_id uuid not null references public.quantity_lines (id) on delete cascade,
  unit_price       numeric(14, 4) check (unit_price >= 0),
  -- A bidder may disagree with the measured quantity. Recording their figure
  -- next to ours, rather than overwriting it, is what turns a dispute into a
  -- comparison.
  quantity_override numeric(18, 6) check (quantity_override >= 0),
  notes            text,
  excluded         boolean not null default false,

  unique (bid_id, quantity_line_id)
);

create index bid_lines_bid_idx on public.bid_lines (bid_id);

alter table public.quote_line_costs
  add constraint quote_line_costs_bid_fk
  foreign key (source_bid_id) references public.bids (id) on delete set null;

create trigger price_books_touch      before update on public.price_books      for each row execute function public.touch_updated_at();
create trigger price_items_touch      before update on public.price_items      for each row execute function public.touch_updated_at();
create trigger quotes_touch           before update on public.quotes           for each row execute function public.touch_updated_at();
create trigger quote_lines_touch      before update on public.quote_lines      for each row execute function public.touch_updated_at();
create trigger quote_line_costs_touch before update on public.quote_line_costs for each row execute function public.touch_updated_at();
create trigger parties_touch          before update on public.parties          for each row execute function public.touch_updated_at();
create trigger work_packages_touch    before update on public.work_packages    for each row execute function public.touch_updated_at();
create trigger bids_touch             before update on public.bids             for each row execute function public.touch_updated_at();
