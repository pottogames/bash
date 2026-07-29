-- =============================================================================
-- System roles and the built-in trade taxonomy.
--
-- These are the defaults an organisation starts from. Roles here are marked
-- `is_system`, which makes them read-only through RLS — an administrator can
-- build a custom role beside them but cannot widen "לקוח" for everybody by
-- editing it in place.
--
-- Note what `client` and `subcontractor` do *not* have: `price.cost.read`. That
-- is the permission that exposes what you pay other people, and it is granted
-- to exactly three internal roles.
-- =============================================================================

insert into public.roles (id, org_id, key, name_he, name_en, description, is_system) values
  ('00000000-0000-0000-0000-000000000001', null, 'owner',           'בעלים',              'Owner',           'שליטה מלאה בארגון, כולל חיוב ומחיקה', true),
  ('00000000-0000-0000-0000-000000000002', null, 'admin',           'מנהל מערכת',         'Administrator',   'ניהול משתמשים, הרשאות ופרויקטים', true),
  ('00000000-0000-0000-0000-000000000003', null, 'project_manager', 'מנהל פרויקט',        'Project manager', 'ניהול מלא של פרויקט: תוכניות, כמויות, הצעות וחבילות', true),
  ('00000000-0000-0000-0000-000000000004', null, 'estimator',       'מודד כמויות',        'Estimator',       'הפקת כתב כמויות והצעות מחיר, ללא ניהול משתמשים', true),
  ('00000000-0000-0000-0000-000000000005', null, 'viewer',          'צופה',               'Viewer',          'צפייה בלבד בפרויקטים ובכמויות, ללא מחירי עלות', true),
  ('00000000-0000-0000-0000-000000000006', null, 'subcontractor',   'קבלן משנה',          'Subcontractor',   'גישה לחבילות עבודה שהוזמן אליהן בלבד', true),
  ('00000000-0000-0000-0000-000000000007', null, 'supplier',        'ספק',                'Supplier',        'גישה לחבילות אספקה שהוזמן אליהן בלבד', true),
  ('00000000-0000-0000-0000-000000000008', null, 'client',          'לקוח / יזם',         'Client',          'צפייה בהצעת המחיר שלו בלבד, ללא עלויות וללא הצעות קבלנים', true),
  ('00000000-0000-0000-0000-000000000009', null, 'architect',       'אדריכל',             'Architect',       'העלאת תוכניות וצפייה בכמויות, ללא גישה למחירים', true);

-- Owner: everything.
insert into public.role_permissions (role_id, permission)
select '00000000-0000-0000-0000-000000000001', unnest(enum_range(null::public.app_permission));

-- Administrator: everything except deleting the organisation itself.
insert into public.role_permissions (role_id, permission)
select '00000000-0000-0000-0000-000000000002', p
from unnest(enum_range(null::public.app_permission)) p
where p <> 'org.manage';

-- Project manager: the whole project lifecycle, no user administration.
insert into public.role_permissions (role_id, permission) values
  ('00000000-0000-0000-0000-000000000003', 'project.create'),
  ('00000000-0000-0000-0000-000000000003', 'project.read'),
  ('00000000-0000-0000-0000-000000000003', 'project.update'),
  ('00000000-0000-0000-0000-000000000003', 'structure.manage'),
  ('00000000-0000-0000-0000-000000000003', 'plan.upload'),
  ('00000000-0000-0000-0000-000000000003', 'plan.read'),
  ('00000000-0000-0000-0000-000000000003', 'plan.delete'),
  ('00000000-0000-0000-0000-000000000003', 'plan.download_source'),
  ('00000000-0000-0000-0000-000000000003', 'layer.read'),
  ('00000000-0000-0000-0000-000000000003', 'layer.update'),
  ('00000000-0000-0000-0000-000000000003', 'quantity.read'),
  ('00000000-0000-0000-0000-000000000003', 'quantity.update'),
  ('00000000-0000-0000-0000-000000000003', 'quantity.approve'),
  ('00000000-0000-0000-0000-000000000003', 'price.cost.read'),
  ('00000000-0000-0000-0000-000000000003', 'price.sell.read'),
  ('00000000-0000-0000-0000-000000000003', 'price.update'),
  ('00000000-0000-0000-0000-000000000003', 'quote.read'),
  ('00000000-0000-0000-0000-000000000003', 'quote.create'),
  ('00000000-0000-0000-0000-000000000003', 'quote.send'),
  ('00000000-0000-0000-0000-000000000003', 'quote.approve'),
  ('00000000-0000-0000-0000-000000000003', 'package.read'),
  ('00000000-0000-0000-0000-000000000003', 'package.create'),
  ('00000000-0000-0000-0000-000000000003', 'package.send'),
  ('00000000-0000-0000-0000-000000000003', 'bid.read'),
  ('00000000-0000-0000-0000-000000000003', 'bid.award');

-- Estimator: produces the numbers, does not send anything out.
insert into public.role_permissions (role_id, permission) values
  ('00000000-0000-0000-0000-000000000004', 'project.read'),
  ('00000000-0000-0000-0000-000000000004', 'structure.manage'),
  ('00000000-0000-0000-0000-000000000004', 'plan.upload'),
  ('00000000-0000-0000-0000-000000000004', 'plan.read'),
  ('00000000-0000-0000-0000-000000000004', 'layer.read'),
  ('00000000-0000-0000-0000-000000000004', 'layer.update'),
  ('00000000-0000-0000-0000-000000000004', 'quantity.read'),
  ('00000000-0000-0000-0000-000000000004', 'quantity.update'),
  ('00000000-0000-0000-0000-000000000004', 'quantity.approve'),
  ('00000000-0000-0000-0000-000000000004', 'price.cost.read'),
  ('00000000-0000-0000-0000-000000000004', 'price.sell.read'),
  ('00000000-0000-0000-0000-000000000004', 'price.update'),
  ('00000000-0000-0000-0000-000000000004', 'quote.read'),
  ('00000000-0000-0000-0000-000000000004', 'quote.create'),
  ('00000000-0000-0000-0000-000000000004', 'package.read'),
  ('00000000-0000-0000-0000-000000000004', 'bid.read');

-- Viewer: reads the work, never the cost side.
insert into public.role_permissions (role_id, permission) values
  ('00000000-0000-0000-0000-000000000005', 'project.read'),
  ('00000000-0000-0000-0000-000000000005', 'plan.read'),
  ('00000000-0000-0000-0000-000000000005', 'layer.read'),
  ('00000000-0000-0000-0000-000000000005', 'quantity.read'),
  ('00000000-0000-0000-0000-000000000005', 'quote.read'),
  ('00000000-0000-0000-0000-000000000005', 'package.read');

-- Subcontractor and supplier: nothing at organisation level at all.
--
-- Their access comes entirely from `package_recipients`, which RLS resolves
-- without consulting the role. `bid.submit` is listed for completeness of the
-- UI's capability checks; the row-level policy is what actually admits them.
insert into public.role_permissions (role_id, permission) values
  ('00000000-0000-0000-0000-000000000006', 'bid.submit'),
  ('00000000-0000-0000-0000-000000000007', 'bid.submit');

-- Client: their own quote, and nothing else. No quantities, no drawings, no
-- packages, no costs.
insert into public.role_permissions (role_id, permission) values
  ('00000000-0000-0000-0000-000000000008', 'quote.read');

-- Architect: uploads and reads drawings, never sees money.
insert into public.role_permissions (role_id, permission) values
  ('00000000-0000-0000-0000-000000000009', 'project.read'),
  ('00000000-0000-0000-0000-000000000009', 'plan.upload'),
  ('00000000-0000-0000-0000-000000000009', 'plan.read'),
  ('00000000-0000-0000-0000-000000000009', 'plan.download_source'),
  ('00000000-0000-0000-0000-000000000009', 'layer.read'),
  ('00000000-0000-0000-0000-000000000009', 'layer.update'),
  ('00000000-0000-0000-0000-000000000009', 'quantity.read');

-- -----------------------------------------------------------------------------
-- Trades — mirrors `TRADES` in `@plan2quote/core`. Kept in step by
-- `packages/core/test/trades-parity.test.ts`, which fails if one side changes
-- without the other.
-- -----------------------------------------------------------------------------
insert into public.trades (org_id, key, name_he, name_en, color, default_measure, billable, is_system, sort_order) values
  (null, 'earthworks',    'עבודות עפר',        'Earthworks',      'oklch(0.62 0.09 60)',  'volume', true,  true,  10),
  (null, 'structure',     'שלד ובטון',         'Structure',       'oklch(0.55 0.03 250)', 'volume', true,  true,  20),
  (null, 'masonry',       'בנייה ובלוקים',     'Masonry',         'oklch(0.63 0.11 40)',  'area',   true,  true,  30),
  (null, 'waterproofing', 'איטום',             'Waterproofing',   'oklch(0.55 0.10 200)', 'area',   true,  true,  40),
  (null, 'plaster',       'טיח',               'Plaster',         'oklch(0.70 0.06 80)',  'area',   true,  true,  50),
  (null, 'drywall',       'גבס',               'Drywall',         'oklch(0.72 0.05 110)', 'area',   true,  true,  60),
  (null, 'flooring',      'ריצוף וחיפוי',      'Flooring',        'oklch(0.65 0.12 25)',  'area',   true,  true,  70),
  (null, 'painting',      'צבע',               'Painting',        'oklch(0.70 0.13 330)', 'area',   true,  true,  80),
  (null, 'electrical',    'חשמל',              'Electrical',      'oklch(0.78 0.16 90)',  'count',  true,  true,  90),
  (null, 'lowvoltage',    'תקשורת ומתח נמוך',  'Low voltage',     'oklch(0.70 0.11 145)', 'count',  true,  true, 100),
  (null, 'plumbing',      'אינסטלציה',         'Plumbing',        'oklch(0.62 0.14 240)', 'length', true,  true, 110),
  (null, 'hvac',          'מיזוג אוויר',       'HVAC',            'oklch(0.72 0.10 195)', 'count',  true,  true, 120),
  (null, 'fire',          'כיבוי אש',          'Fire protection', 'oklch(0.58 0.19 25)',  'count',  true,  true, 130),
  (null, 'aluminum',      'אלומיניום',         'Aluminium',       'oklch(0.72 0.03 240)', 'area',   true,  true, 140),
  (null, 'carpentry',     'נגרות',             'Carpentry',       'oklch(0.58 0.09 55)',  'count',  true,  true, 150),
  (null, 'doors_windows', 'דלתות וחלונות',     'Doors & windows', 'oklch(0.66 0.10 300)', 'count',  true,  true, 160),
  (null, 'roofing',       'גגות',              'Roofing',         'oklch(0.52 0.08 170)', 'area',   true,  true, 170),
  (null, 'elevator',      'מעליות',            'Elevators',       'oklch(0.50 0.06 285)', 'count',  true,  true, 180),
  (null, 'landscape',     'פיתוח וגינון',      'Landscape',       'oklch(0.68 0.14 140)', 'area',   true,  true, 190),
  (null, 'demolition',    'הריסה',             'Demolition',      'oklch(0.48 0.10 20)',  'volume', true,  true, 200),
  (null, 'annotation',    'הערות וסימונים',    'Annotation',      'oklch(0.60 0.01 250)', 'count',  false, true, 900),
  (null, 'unassigned',    'לא משויך',          'Unassigned',      'oklch(0.65 0.01 250)', 'count',  false, true, 999);
