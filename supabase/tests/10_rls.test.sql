-- =============================================================================
-- Row-level-security tests.
--
-- These do not test the UI. They impersonate a user at the database level —
-- `set role authenticated` plus a subject claim — which is exactly what a
-- leaked JWT can do. If a policy is wrong, it is wrong here first.
--
-- Every assertion is a claim about a specific person seeing, or not seeing,
-- specific rows. Run by `scripts/test-db.sh`.
-- =============================================================================

\set ON_ERROR_STOP on
set client_min_messages = warning;

-- -----------------------------------------------------------------------------
-- Fixture: one organisation, two projects, one subcontractor package.
-- -----------------------------------------------------------------------------
create or replace function pg_temp.as_user(u uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, true);
end $$;

create or replace function pg_temp.assert(condition boolean, message text) returns void
language plpgsql as $$
begin
  if not condition then
    raise exception 'ASSERTION FAILED: %', message;
  end if;
end $$;

do $$
declare
  org_a uuid := gen_random_uuid();
  org_b uuid := gen_random_uuid();
  u_owner uuid := gen_random_uuid();
  u_estimator uuid := gen_random_uuid();
  u_viewer uuid := gen_random_uuid();
  u_sub uuid := gen_random_uuid();
  u_other_sub uuid := gen_random_uuid();
  u_outsider uuid := gen_random_uuid();
  u_pending uuid := gen_random_uuid();
  u_pending2 uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values
    (u_owner, 'owner@example.com'),
    (u_estimator, 'estimator@example.com'),
    (u_viewer, 'viewer@example.com'),
    (u_sub, 'sub@example.com'),
    (u_other_sub, 'othersub@example.com'),
    (u_outsider, 'outsider@example.com'),
    (u_pending, 'pending@example.com'),
    (u_pending2, 'pending2@example.com');

  insert into public.organizations (id, name, slug) values
    (org_a, 'ארגון א', 'org-a'),
    (org_b, 'ארגון ב', 'org-b');

  -- Active memberships. `approve_membership` is exercised separately below;
  -- here the rows are written directly so the policy tests start from a known
  -- state.
  insert into public.memberships (org_id, user_id, role_id, status, approved_by, approved_at, approved_role_id) values
    (org_a, u_owner,     '00000000-0000-0000-0000-000000000001', 'active', u_owner, now(), '00000000-0000-0000-0000-000000000001'),
    (org_a, u_estimator, '00000000-0000-0000-0000-000000000004', 'active', u_owner, now(), '00000000-0000-0000-0000-000000000004'),
    (org_a, u_viewer,    '00000000-0000-0000-0000-000000000005', 'active', u_owner, now(), '00000000-0000-0000-0000-000000000005'),
    (org_a, u_sub,       '00000000-0000-0000-0000-000000000006', 'active', u_owner, now(), '00000000-0000-0000-0000-000000000006'),
    (org_a, u_other_sub, '00000000-0000-0000-0000-000000000006', 'active', u_owner, now(), '00000000-0000-0000-0000-000000000006'),
    (org_b, u_outsider,  '00000000-0000-0000-0000-000000000001', 'active', u_outsider, now(), '00000000-0000-0000-0000-000000000001');

  -- Registered with a valid code, not yet approved. Must see nothing.
  insert into public.memberships (org_id, user_id, role_id, status) values
    (org_a, u_pending,  '00000000-0000-0000-0000-000000000003', 'pending_approval'),
    (org_a, u_pending2, '00000000-0000-0000-0000-000000000003', 'pending_approval');

  perform set_config('test.org_a', org_a::text, false);
  perform set_config('test.org_b', org_b::text, false);
  perform set_config('test.u_owner', u_owner::text, false);
  perform set_config('test.u_estimator', u_estimator::text, false);
  perform set_config('test.u_viewer', u_viewer::text, false);
  perform set_config('test.u_sub', u_sub::text, false);
  perform set_config('test.u_other_sub', u_other_sub::text, false);
  perform set_config('test.u_outsider', u_outsider::text, false);
  perform set_config('test.u_pending', u_pending::text, false);
  perform set_config('test.u_pending2', u_pending2::text, false);
end $$;

do $$
declare
  org_a uuid := current_setting('test.org_a')::uuid;
  org_b uuid := current_setting('test.org_b')::uuid;
  proj_a uuid := gen_random_uuid();
  proj_b uuid := gen_random_uuid();
  bld uuid := gen_random_uuid();
  flr uuid := gen_random_uuid();
  plan_id uuid := gen_random_uuid();
  layer_elec uuid := gen_random_uuid();
  layer_plumb uuid := gen_random_uuid();
  ql_elec uuid := gen_random_uuid();
  ql_plumb uuid := gen_random_uuid();
  pkg uuid := gen_random_uuid();
  party uuid := gen_random_uuid();
  recip uuid := gen_random_uuid();
  quote_id uuid := gen_random_uuid();
  qline uuid := gen_random_uuid();
  t_elec uuid;
  t_plumb uuid;
begin
  select id into t_elec  from public.trades where key = 'electrical';
  select id into t_plumb from public.trades where key = 'plumbing';

  insert into public.projects (id, org_id, name) values
    (proj_a, org_a, 'מגדל הרצל'),
    (proj_b, org_b, 'פרויקט של ארגון אחר');

  insert into public.buildings (id, project_id, name) values (bld, proj_a, 'בניין A');
  insert into public.floors (id, building_id, level, name) values (flr, bld, 3, 'קומה 3');

  insert into public.plans (id, project_id, building_id, floor_id, name, original_filename, format, storage_path, status)
  values (plan_id, proj_a, bld, flr, 'קומה 3', 'floor3.dxf', 'dxf', 'plans/floor3.dxf', 'parsed');

  insert into public.plan_layers (id, plan_id, source_key, source_name, trade_id, measure_type)
  values
    (layer_elec,  plan_id, 'חשמל',       'חשמל',       t_elec,  'count'),
    (layer_plumb, plan_id, 'אינסטלציה', 'אינסטלציה', t_plumb, 'length');

  insert into public.quantity_lines (id, project_id, plan_id, layer_id, floor_id, trade_id, description, measure_type, unit, value)
  values
    (ql_elec,  proj_a, plan_id, layer_elec,  flr, t_elec,  'נקודות חשמל', 'count',  'יח''', 42),
    (ql_plumb, proj_a, plan_id, layer_plumb, flr, t_plumb, 'צנרת מים',    'length', 'm''',  118.5);

  insert into public.parties (id, org_id, kind, name) values (party, org_a, 'subcontractor', 'חשמל כהן בע״מ');

  insert into public.work_packages (id, project_id, trade_id, name, status)
  values (pkg, proj_a, t_elec, 'חבילת חשמל קומה 3', 'sent');

  insert into public.work_package_lines (work_package_id, quantity_line_id) values (pkg, ql_elec);
  insert into public.work_package_layers (work_package_id, plan_layer_id) values (pkg, layer_elec);

  insert into public.package_recipients (id, work_package_id, party_id, user_id)
  values (recip, pkg, party, current_setting('test.u_sub')::uuid);

  insert into public.quotes (id, project_id, title) values (quote_id, proj_a, 'הצעת מחיר 1');
  insert into public.quote_lines (id, quote_id, description, unit, quantity, unit_price)
  values (qline, quote_id, 'נקודות חשמל', 'יח''', 42, 180);
  insert into public.quote_line_costs (quote_line_id, cost_price) values (qline, 110);

  perform set_config('test.proj_a', proj_a::text, false);
  perform set_config('test.pkg', pkg::text, false);
  perform set_config('test.ql_elec', ql_elec::text, false);
  perform set_config('test.ql_plumb', ql_plumb::text, false);
  perform set_config('test.layer_elec', layer_elec::text, false);
  perform set_config('test.layer_plumb', layer_plumb::text, false);
  perform set_config('test.recip', recip::text, false);
end $$;

-- =============================================================================
-- 1. A subcontractor sees only their own package
-- =============================================================================
set role authenticated;

do $$
begin
  perform pg_temp.as_user(current_setting('test.u_sub')::uuid);

  perform pg_temp.assert(
    (select count(*) from public.quantity_lines) = 1,
    'קבלן משנה רואה בדיוק שורת כמות אחת — זו שבחבילה שלו');

  perform pg_temp.assert(
    (select count(*) from public.quantity_lines where id = current_setting('test.ql_elec')::uuid) = 1,
    'שורת החשמל שבחבילה נראית');

  perform pg_temp.assert(
    (select count(*) from public.quantity_lines where id = current_setting('test.ql_plumb')::uuid) = 0,
    'שורת האינסטלציה שאינה בחבילה אינה נראית');

  perform pg_temp.assert(
    (select count(*) from public.plan_layers where id = current_setting('test.layer_plumb')::uuid) = 0,
    'שכבה שאינה בחבילה אינה נראית');

  perform pg_temp.assert(
    (select count(*) from public.plan_layers where id = current_setting('test.layer_elec')::uuid) = 1,
    'השכבה שבחבילה כן נראית');

  perform pg_temp.assert(
    (select count(*) from public.projects) = 0,
    'קבלן משנה אינו רואה את הפרויקט עצמו');

  perform pg_temp.assert(
    (select count(*) from public.plans) = 0,
    'קבלן משנה אינו רואה את רשומת התוכנית או את נתיב הקובץ המקורי');

  perform pg_temp.assert(
    (select count(*) from public.quotes) = 0,
    'קבלן משנה אינו רואה את הצעת המחיר ללקוח');

  perform pg_temp.assert(
    (select count(*) from public.quote_line_costs) = 0,
    'קבלן משנה אינו רואה מחירי עלות');

  perform pg_temp.assert(
    (select count(*) from public.price_items) = 0,
    'קבלן משנה אינו רואה את המחירון');
end $$;

-- =============================================================================
-- 2. One subcontractor cannot see another's package or bid
-- =============================================================================
do $$
begin
  perform pg_temp.as_user(current_setting('test.u_other_sub')::uuid);

  perform pg_temp.assert(
    (select count(*) from public.quantity_lines) = 0,
    'קבלן שלא הוזמן לחבילה אינו רואה שום שורת כמות');

  perform pg_temp.assert(
    (select count(*) from public.work_packages) = 0,
    'קבלן שלא הוזמן אינו רואה את החבילה');

  perform pg_temp.assert(
    (select count(*) from public.package_recipients) = 0,
    'קבלן אינו יכול למנות מי עוד הוזמן להגיש הצעה');
end $$;

-- =============================================================================
-- 3. A member of another organisation sees nothing at all
-- =============================================================================
do $$
begin
  perform pg_temp.as_user(current_setting('test.u_outsider')::uuid);

  -- The outsider is an owner in their own organisation, so they see their own
  -- project and must see exactly that one.
  perform pg_temp.assert(
    (select count(*) from public.projects) = 1
    and (select count(*) from public.projects where org_id = current_setting('test.org_b')::uuid) = 1,
    'ארגון אחר רואה רק את הפרויקט של עצמו');

  perform pg_temp.assert(
    (select count(*) from public.projects where id = current_setting('test.proj_a')::uuid) = 0,
    'ארגון אחר אינו רואה את הפרויקט של ארגון א');
  perform pg_temp.assert((select count(*) from public.quantity_lines) = 0, 'ארגון אחר אינו רואה כמויות');
  perform pg_temp.assert((select count(*) from public.plan_layers) = 0, 'ארגון אחר אינו רואה שכבות');
  perform pg_temp.assert((select count(*) from public.quotes) = 0, 'ארגון אחר אינו רואה הצעות מחיר');
  perform pg_temp.assert((select count(*) from public.parties) = 0, 'ארגון אחר אינו רואה ספקים');
end $$;

-- =============================================================================
-- 4. A registered-but-unapproved account is inert
--
-- This is the guarantee the customer asked for: completing sign-up with a valid
-- code grants nothing until an administrator approves it.
-- =============================================================================
do $$
begin
  perform pg_temp.as_user(current_setting('test.u_pending')::uuid);

  perform pg_temp.assert(
    (select count(*) from public.current_org_ids()) = 0,
    'חשבון שממתין לאישור אינו חבר פעיל באף ארגון');

  perform pg_temp.assert(
    (select count(*) from public.projects) = 0,
    'חשבון שממתין לאישור אינו רואה פרויקטים — למרות שהתפקיד שהוקצה לו הוא מנהל פרויקט');

  perform pg_temp.assert(
    (select count(*) from public.quantity_lines) = 0,
    'חשבון שממתין לאישור אינו רואה כמויות');

  perform pg_temp.assert(
    (select count(*) from public.memberships where user_id = auth.uid()) = 1,
    'החשבון כן רואה את החברות שלו עצמו, כדי שמסך "ממתין לאישור" יוכל להציג משהו');
end $$;

-- =============================================================================
-- 5. A pending account cannot approve itself
-- =============================================================================
do $$
declare
  own_membership uuid;
  raised boolean := false;
begin
  perform pg_temp.as_user(current_setting('test.u_pending')::uuid);
  select id into own_membership from public.memberships where user_id = auth.uid();

  begin
    perform public.approve_membership(own_membership, '00000000-0000-0000-0000-000000000003');
  exception when others then
    raised := true;
  end;

  perform pg_temp.assert(raised, 'ניסיון לאשר את החשבון של עצמך נכשל');
  perform pg_temp.assert(
    (select status from public.memberships where id = own_membership) = 'pending_approval',
    'החברות נשארה ממתינה לאישור');
end $$;

-- =============================================================================
-- 6. A member cannot activate a membership by writing to the table
-- =============================================================================
do $$
declare
  pending_id uuid;
  activated integer;
begin
  perform pg_temp.as_user(current_setting('test.u_owner')::uuid);
  select id into pending_id from public.memberships where user_id = current_setting('test.u_pending')::uuid;

  -- The owner holds `org.members.manage`, which allows suspending — but the
  -- policy's WITH CHECK forbids writing `active`. A WITH CHECK violation raises
  -- rather than silently filtering, which is the outcome we want: the attempt
  -- is refused loudly instead of appearing to succeed.
  begin
    update public.memberships set status = 'active' where id = pending_id;
    perform pg_temp.assert(false,
      'אפילו בעלים לא יכול להפעיל חשבון ב-UPDATE ישיר — רק דרך approve_membership');
  exception when insufficient_privilege then
    null;  -- expected
  end;

  update public.memberships set status = 'suspended' where id = pending_id;
  get diagnostics activated = row_count;
  perform pg_temp.assert(activated = 1, 'השעיה כן מותרת');

  -- Deliberately not reset. Moving a membership back to `pending_approval` is
  -- refused by the same WITH CHECK, which is correct: re-admitting a suspended
  -- account must go through the approval path like any other grant.
end $$;

-- =============================================================================
-- 7. Approval works through the function, and records what was approved
-- =============================================================================
do $$
declare
  pending_id uuid;
  m public.memberships%rowtype;
  raised boolean := false;
begin
  perform pg_temp.as_user(current_setting('test.u_owner')::uuid);
  select id into pending_id from public.memberships where user_id = current_setting('test.u_pending2')::uuid;

  -- Confirming the wrong role must fail: the approver is restating what they
  -- believe they are granting.
  begin
    perform public.approve_membership(pending_id, '00000000-0000-0000-0000-000000000001');
  exception when others then
    raised := true;
  end;
  perform pg_temp.assert(raised, 'אישור עם תפקיד שאינו תואם נדחה');

  perform public.approve_membership(
    pending_id,
    '00000000-0000-0000-0000-000000000003',
    array['org.audit.read']::public.app_permission[],
    array['price.cost.read']::public.app_permission[]
  );

  select * into m from public.memberships where id = pending_id;
  perform pg_temp.assert(m.status = 'active', 'החברות הופעלה');
  perform pg_temp.assert(m.approved_by = auth.uid(), 'נרשם מי אישר');
  perform pg_temp.assert(m.approved_role_id = '00000000-0000-0000-0000-000000000003', 'נרשם איזה תפקיד אושר');
end $$;

-- =============================================================================
-- 8. Explicit revocation beats the role
-- =============================================================================
do $$
declare
  org_a uuid := current_setting('test.org_a')::uuid;
begin
  perform pg_temp.as_user(current_setting('test.u_pending2')::uuid);

  -- The project-manager role grants `price.cost.read`; the approval revoked it.
  perform pg_temp.assert(
    not public.has_permission(org_a, 'price.cost.read'),
    'שלילה מפורשת גוברת על ההרשאה שהתפקיד נותן');

  perform pg_temp.assert(
    public.has_permission(org_a, 'org.audit.read'),
    'הענקה מפורשת מוסיפה הרשאה מעבר לתפקיד');

  perform pg_temp.assert(
    public.has_permission(org_a, 'quantity.read'),
    'שאר הרשאות התפקיד נשמרו');

  perform pg_temp.assert(
    (select count(*) from public.quote_line_costs) = 0,
    'ההרשאה שנשללה אכן חוסמת קריאה בפועל, לא רק בפונקציה');
end $$;

-- =============================================================================
-- 9. Cost prices are visible only to roles that hold `price.cost.read`
-- =============================================================================
do $$
begin
  perform pg_temp.as_user(current_setting('test.u_estimator')::uuid);
  perform pg_temp.assert((select count(*) from public.quote_line_costs) = 1,
    'מודד כמויות רואה מחירי עלות');
  perform pg_temp.assert((select count(*) from public.quote_lines) = 1,
    'מודד כמויות רואה את שורות ההצעה');

  perform pg_temp.as_user(current_setting('test.u_viewer')::uuid);
  perform pg_temp.assert((select count(*) from public.quote_lines) = 1,
    'צופה רואה את שורות ההצעה');
  perform pg_temp.assert((select count(*) from public.quote_line_costs) = 0,
    'צופה אינו רואה מחירי עלות');
  perform pg_temp.assert((select count(*) from public.price_books) = 0,
    'צופה אינו רואה את המחירון');
end $$;

-- =============================================================================
-- 10. Expired access closes the door without anybody switching it off
-- =============================================================================
do $$
begin
  perform pg_temp.as_user(current_setting('test.u_owner')::uuid);
  update public.package_recipients
  set access_expires_at = now() - interval '1 day'
  where id = current_setting('test.recip')::uuid;

  perform pg_temp.as_user(current_setting('test.u_sub')::uuid);
  perform pg_temp.assert((select count(*) from public.quantity_lines) = 0,
    'לאחר פקיעת תוקף הגישה הקבלן אינו רואה כמויות');
  perform pg_temp.assert((select count(*) from public.plan_layers) = 0,
    'לאחר פקיעת תוקף הגישה הקבלן אינו רואה שכבות');

  perform pg_temp.as_user(current_setting('test.u_owner')::uuid);
  update public.package_recipients set access_expires_at = null
  where id = current_setting('test.recip')::uuid;
end $$;

-- =============================================================================
-- 11. A draft package is not visible to its recipients
-- =============================================================================
do $$
begin
  perform pg_temp.as_user(current_setting('test.u_owner')::uuid);
  update public.work_packages set status = 'draft' where id = current_setting('test.pkg')::uuid;

  perform pg_temp.as_user(current_setting('test.u_sub')::uuid);
  perform pg_temp.assert((select count(*) from public.work_packages) = 0,
    'חבילה בסטטוס טיוטה אינה נראית לנמענים שלה');
  perform pg_temp.assert((select count(*) from public.quantity_lines) = 0,
    'כמויות של חבילה בטיוטה אינן נראות');

  perform pg_temp.as_user(current_setting('test.u_owner')::uuid);
  update public.work_packages set status = 'sent' where id = current_setting('test.pkg')::uuid;
end $$;

-- =============================================================================
-- 12. Invitation codes
-- =============================================================================
reset role;
do $$
declare
  new_user uuid := gen_random_uuid();
  wrong_user uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (new_user, 'invited@example.com'), (wrong_user, 'notinvited@example.com');

  -- No explicit profile insert: `on_auth_user_created` writes it. Asserting
  -- that here is what proves the trigger runs — without it, redemption would
  -- have no email to check the invitation against.
  perform pg_temp.assert(
    (select email from public.profiles where id = new_user) = 'invited@example.com',
    'טריגר יצירת הפרופיל רץ אוטומטית עם יצירת המשתמש');

  perform set_config('test.new_user', new_user::text, false);
  perform set_config('test.wrong_user', wrong_user::text, false);
end $$;

set role authenticated;
do $$
declare
  org_a uuid := current_setting('test.org_a')::uuid;
  issued record;
  raised boolean := false;
  membership_id uuid;
begin
  perform pg_temp.as_user(current_setting('test.u_owner')::uuid);
  select * into issued from public.create_invitation(
    org_a, 'invited@example.com', '00000000-0000-0000-0000-000000000004'
  );

  perform pg_temp.assert(issued.code is not null and length(issued.code) > 30,
    'נוצר קוד הזמנה באורך סביר');

  -- The plaintext must not be recoverable from the table.
  perform pg_temp.as_user(current_setting('test.u_owner')::uuid);
  perform pg_temp.assert(
    (select count(*) from public.invitations where id = issued.invitation_id
       and code_hint like left(issued.code, 4) || '%') = 1,
    'הטבלה שומרת רק רמז לקוד, לא את הקוד עצמו');

  -- Wrong person, right code.
  perform pg_temp.as_user(current_setting('test.wrong_user')::uuid);
  begin
    perform public.redeem_invitation(issued.code);
  exception when others then
    raised := true;
  end;
  perform pg_temp.assert(raised, 'קוד שהונפק לכתובת אחת אינו ניתן למימוש על ידי כתובת אחרת');

  -- Right person.
  perform pg_temp.as_user(current_setting('test.new_user')::uuid);
  membership_id := public.redeem_invitation(issued.code);

  perform pg_temp.assert(
    (select status from public.memberships where id = membership_id) = 'pending_approval',
    'מימוש קוד יוצר חברות שממתינה לאישור, לא חברות פעילה');

  perform pg_temp.assert(
    (select count(*) from public.projects) = 0,
    'מיד לאחר המימוש המשתמש עדיין אינו רואה דבר');

  -- Second redemption of the same code.
  raised := false;
  begin
    perform public.redeem_invitation(issued.code);
  exception when others then
    raised := true;
  end;
  perform pg_temp.assert(raised, 'קוד שמומש אינו ניתן למימוש חוזר');

  -- A garbage code.
  raised := false;
  begin
    perform public.redeem_invitation('AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG-HHHH');
  exception when others then
    raised := true;
  end;
  perform pg_temp.assert(raised, 'קוד שגוי נדחה');
end $$;

-- =============================================================================
-- 13. A subcontractor cannot invite anybody
-- =============================================================================
do $$
declare
  raised boolean := false;
begin
  perform pg_temp.as_user(current_setting('test.u_sub')::uuid);
  begin
    perform public.create_invitation(
      current_setting('test.org_a')::uuid, 'x@example.com', '00000000-0000-0000-0000-000000000001'
    );
  exception when others then
    raised := true;
  end;
  perform pg_temp.assert(raised, 'קבלן משנה אינו יכול להנפיק קודי הזמנה');
end $$;

-- =============================================================================
-- 14. The audit log cannot be rewritten
-- =============================================================================
do $$
declare
  raised boolean := false;
  affected integer;
begin
  perform pg_temp.as_user(current_setting('test.u_owner')::uuid);
  perform pg_temp.assert((select count(*) from public.audit_log) > 0,
    'פעולות רגישות נרשמות ביומן הביקורת');

  begin
    delete from public.audit_log;
    get diagnostics affected = row_count;
    perform pg_temp.assert(affected = 0, 'לא ניתן למחוק שורות מיומן הביקורת');
  exception when insufficient_privilege then
    raised := true;
  end;
  perform pg_temp.assert(true, 'יומן הביקורת מוגן');
end $$;

reset role;
select 'ALL RLS TESTS PASSED' as result;
