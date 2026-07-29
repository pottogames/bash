'use client';

import { getSupabase } from './supabase/client';
import type {
  Building,
  Floor,
  Invitation,
  MeasureType,
  Membership,
  Plan,
  PlanLayer,
  PriceItem,
  Profile,
  Project,
  QuantityLine,
  Role,
  Trade,
  Zone,
} from './supabase/types';

/**
 * Every read the application makes.
 *
 * Kept in one file so the answer to "what does this product ask the database
 * for?" is a single list. None of these filter by organisation or by role —
 * that filtering is row level security's job, and duplicating it here would
 * create a second, quieter version of the rules that could drift from the real
 * one.
 */

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as T;
}

/* ------------------------------------------------------------------ session */

export interface SessionInfo {
  userId: string;
  email: string;
  fullName: string | null;
  orgId: string | null;
  orgName: string | null;
  roleKey: string | null;
  roleName: string | null;
}

export async function fetchSession(): Promise<SessionInfo | null> {
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', auth.user.id).maybeSingle(),
    supabase
      .from('memberships')
      .select('org_id, role_id, status')
      .eq('status', 'active')
      .limit(1),
  ]);

  const membership = memberships?.[0] ?? null;
  let orgName: string | null = null;
  let role: Pick<Role, 'key' | 'name_he'> | null = null;

  if (membership) {
    const [{ data: org }, { data: roleRow }] = await Promise.all([
      supabase.from('organizations').select('name').eq('id', membership.org_id).maybeSingle(),
      supabase.from('roles').select('key, name_he').eq('id', membership.role_id).maybeSingle(),
    ]);
    orgName = org?.name ?? null;
    role = roleRow ?? null;
  }

  return {
    userId: auth.user.id,
    email: (profile as Profile | null)?.email ?? auth.user.email ?? '',
    fullName: (profile as Profile | null)?.full_name ?? null,
    orgId: membership?.org_id ?? null,
    orgName,
    roleKey: role?.key ?? null,
    roleName: role?.name_he ?? null,
  };
}

/* ----------------------------------------------------------------- projects */

export async function fetchProjects(): Promise<Project[]> {
  const supabase = getSupabase();
  return unwrap<Project[]>(
    await supabase.from('projects').select('*').order('created_at', { ascending: false }),
  );
}

export async function fetchProject(projectId: string): Promise<Project | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('projects').select('*').eq('id', projectId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Project | null;
}

/* ---------------------------------------------------------------- structure */

export interface StructureTree {
  project: Project;
  buildings: (Building & { floors: (Floor & { zones: Zone[] })[] })[];
}

export async function fetchStructure(projectId: string): Promise<StructureTree | null> {
  const supabase = getSupabase();
  const project = await fetchProject(projectId);
  if (!project) return null;

  const buildings = unwrap<Building[]>(
    await supabase
      .from('buildings')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order')
      .order('name'),
  );
  if (buildings.length === 0) return { project, buildings: [] };

  const floors = unwrap<Floor[]>(
    await supabase
      .from('floors')
      .select('*')
      .in('building_id', buildings.map((b) => b.id))
      .order('level', { ascending: false }),
  );

  const zones = floors.length
    ? unwrap<Zone[]>(
        await supabase
          .from('zones')
          .select('*')
          .in('floor_id', floors.map((f) => f.id))
          .order('sort_order')
          .order('name'),
      )
    : [];

  return {
    project,
    buildings: buildings.map((building) => ({
      ...building,
      floors: floors
        .filter((floor) => floor.building_id === building.id)
        .map((floor) => ({
          ...floor,
          zones: zones.filter((zone) => zone.floor_id === floor.id),
        })),
    })),
  };
}

/* ------------------------------------------------------------------- trades */

export async function fetchTrades(): Promise<Trade[]> {
  const supabase = getSupabase();
  return unwrap<Trade[]>(await supabase.from('trades').select('*').order('sort_order'));
}

/* ------------------------------------------------------- plans and layers */

export async function fetchPlans(projectId: string): Promise<Plan[]> {
  const supabase = getSupabase();
  return unwrap<Plan[]>(
    await supabase
      .from('plans')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
  );
}

export interface LayerWithPlan extends PlanLayer {
  plan_name: string;
  plan_measurable: boolean;
}

export async function fetchLayers(projectId: string): Promise<LayerWithPlan[]> {
  const supabase = getSupabase();
  const plans = await fetchPlans(projectId);
  if (plans.length === 0) return [];

  const layers = unwrap<PlanLayer[]>(
    await supabase
      .from('plan_layers')
      .select('*')
      .in('plan_id', plans.map((p) => p.id))
      .order('entity_count', { ascending: false }),
  );

  const byId = new Map(plans.map((p) => [p.id, p]));
  return layers.map((layer) => {
    const plan = byId.get(layer.plan_id);
    return {
      ...layer,
      plan_name: plan?.name ?? '',
      plan_measurable: plan?.measurable ?? false,
    };
  });
}

/**
 * Quantities already computed for a project, keyed by the layer they came from.
 *
 * The take-off itself runs in the browser worker and is written back as
 * `quantity_lines`; this screen only reads what was stored, so a number shown
 * next to a layer is always the number a quote would use — not a second,
 * slightly different calculation done for display.
 */
export async function fetchLayerQuantities(
  projectId: string,
): Promise<Map<string, { value: number; measure_type: MeasureType; unit: string }>> {
  const supabase = getSupabase();
  const lines = unwrap<Pick<QuantityLine, 'layer_id' | 'value' | 'measure_type' | 'unit' | 'floor_multiplier'>[]>(
    await supabase
      .from('quantity_lines')
      .select('layer_id, value, measure_type, unit, floor_multiplier')
      .eq('project_id', projectId),
  );

  const byLayer = new Map<string, { value: number; measure_type: MeasureType; unit: string }>();
  for (const line of lines) {
    if (!line.layer_id) continue;
    const existing = byLayer.get(line.layer_id);
    const value = line.value * (line.floor_multiplier ?? 1);
    if (existing) existing.value += value;
    else byLayer.set(line.layer_id, { value, measure_type: line.measure_type, unit: line.unit });
  }
  return byLayer;
}

/**
 * Renames or re-assigns a layer.
 *
 * `source_name` is never in the update set — it is what the file said, and the
 * whole point of keeping `display_name` separate is that re-importing a newer
 * revision of the same drawing can still match on the original name.
 */
export async function updateLayer(
  layerId: string,
  patch: { display_name?: string | null; trade_id?: string | null; excluded?: boolean },
): Promise<void> {
  const supabase = getSupabase();
  const update: Partial<PlanLayer> = { ...patch };
  if ('trade_id' in patch) {
    update.classification_source = 'manual';
    update.confidence = 1;
  }
  const { error } = await supabase.from('plan_layers').update(update).eq('id', layerId);
  if (error) throw new Error(error.message);
}

/**
 * The rolled-up analysis for a project: quantities summed by trade, plus a
 * rough cost estimate wherever the org's default price book has a rate for
 * that trade.
 *
 * This is deliberately not a quote. A quote is a versioned, sent document with
 * its own cost/sell split (`quotes` / `quote_lines` / `quote_line_costs`); this
 * is the number a project owner wants before any of that exists — "roughly
 * where does this land" from whatever has been measured and priced so far.
 * Trades with no matching price item are still listed, just without a cost
 * column, so a missing rate reads as "not priced yet" rather than "free".
 */
export interface TradeAnalysis {
  trade_id: string;
  trade_name: string;
  color: string;
  measure_type: MeasureType;
  quantity: number;
  unit: string;
  estimated_cost: number | null;
}

export interface ProjectAnalysis {
  trades: TradeAnalysis[];
  totalEstimatedCost: number | null;
  pricedTradeCount: number;
  hasPriceBook: boolean;
  totalPlans: number;
  unmeasurablePlans: number;
  currency: string;
}

export async function fetchProjectAnalysis(projectId: string): Promise<ProjectAnalysis> {
  const supabase = getSupabase();

  const [lines, trades, plans, priceBooks] = await Promise.all([
    unwrap<Pick<QuantityLine, 'trade_id' | 'value' | 'measure_type' | 'unit' | 'floor_multiplier'>[]>(
      await supabase
        .from('quantity_lines')
        .select('trade_id, value, measure_type, unit, floor_multiplier')
        .eq('project_id', projectId),
    ),
    unwrap<Trade[]>(await supabase.from('trades').select('*')),
    unwrap<Pick<Plan, 'id' | 'measurable'>[]>(
      await supabase.from('plans').select('id, measurable').eq('project_id', projectId),
    ),
    unwrap<{ id: string; currency: string }[]>(
      await supabase.from('price_books').select('id, currency').eq('is_default', true).limit(1),
    ),
  ]);

  const tradeById = new Map(trades.map((t) => [t.id, t]));
  const byTrade = new Map<string, { quantity: number; unit: string; measure_type: MeasureType }>();
  for (const line of lines) {
    if (!line.trade_id) continue;
    const value = line.value * (line.floor_multiplier || 1);
    const existing = byTrade.get(line.trade_id);
    if (existing) existing.quantity += value;
    else byTrade.set(line.trade_id, { quantity: value, unit: line.unit, measure_type: line.measure_type });
  }

  const priceBook = priceBooks[0] ?? null;
  const rateByTrade = new Map<string, number>();
  if (priceBook) {
    const items = unwrap<Pick<PriceItem, 'trade_id' | 'cost_price' | 'default_margin'>[]>(
      await supabase
        .from('price_items')
        .select('trade_id, cost_price, default_margin')
        .eq('price_book_id', priceBook.id)
        .not('trade_id', 'is', null)
        .not('cost_price', 'is', null),
    );
    // Several price items can share a trade (different finishes); average their
    // sell rate rather than picking one arbitrarily.
    const sums = new Map<string, { total: number; count: number }>();
    for (const item of items) {
      if (!item.trade_id || item.cost_price == null) continue;
      const sellRate = item.cost_price * (1 + item.default_margin);
      const entry = sums.get(item.trade_id) ?? { total: 0, count: 0 };
      entry.total += sellRate;
      entry.count += 1;
      sums.set(item.trade_id, entry);
    }
    for (const [tradeId, { total, count }] of sums) rateByTrade.set(tradeId, total / count);
  }

  const analysisTrades: TradeAnalysis[] = [...byTrade.entries()]
    .map(([tradeId, agg]) => {
      const trade = tradeById.get(tradeId);
      const rate = rateByTrade.get(tradeId);
      return {
        trade_id: tradeId,
        trade_name: trade?.name_he ?? 'לא ידוע',
        color: trade?.color ?? 'var(--mantine-color-slate-6)',
        measure_type: agg.measure_type,
        quantity: agg.quantity,
        unit: agg.unit,
        estimated_cost: rate != null ? agg.quantity * rate : null,
      };
    })
    .sort((a, b) => (b.estimated_cost ?? 0) - (a.estimated_cost ?? 0) || b.quantity - a.quantity);

  const pricedTradeCount = analysisTrades.filter((t) => t.estimated_cost != null).length;
  const totalEstimatedCost = pricedTradeCount
    ? analysisTrades.reduce((sum, t) => sum + (t.estimated_cost ?? 0), 0)
    : null;

  return {
    trades: analysisTrades,
    totalEstimatedCost,
    pricedTradeCount,
    hasPriceBook: Boolean(priceBook),
    totalPlans: plans.length,
    unmeasurablePlans: plans.filter((p) => !p.measurable).length,
    currency: priceBook?.currency ?? 'ILS',
  };
}

/* ------------------------------------------------------------------- admin */

export interface MemberRow extends Membership {
  profile: Pick<Profile, 'email' | 'full_name' | 'company_name'> | null;
  role: Pick<Role, 'key' | 'name_he'> | null;
}

export async function fetchMembers(): Promise<MemberRow[]> {
  const supabase = getSupabase();
  const memberships = unwrap<Membership[]>(
    await supabase.from('memberships').select('*').order('created_at', { ascending: false }),
  );
  if (memberships.length === 0) return [];

  const [{ data: profiles }, { data: roles }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, full_name, company_name')
      .in('id', memberships.map((m) => m.user_id)),
    supabase.from('roles').select('id, key, name_he'),
  ]);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const roleById = new Map((roles ?? []).map((r) => [r.id, r]));

  return memberships.map((membership) => ({
    ...membership,
    profile: (profileById.get(membership.user_id) as MemberRow['profile']) ?? null,
    role: (roleById.get(membership.role_id) as MemberRow['role']) ?? null,
  }));
}

export interface InvitationRow extends Invitation {
  role_name: string | null;
}

export async function fetchInvitations(): Promise<InvitationRow[]> {
  const supabase = getSupabase();
  const invitations = unwrap<Invitation[]>(
    await supabase.from('invitations').select('*').order('created_at', { ascending: false }),
  );
  if (invitations.length === 0) return [];

  const { data: roles } = await supabase.from('roles').select('id, name_he');
  const roleById = new Map((roles ?? []).map((r) => [r.id, r.name_he]));

  return invitations.map((invitation) => ({
    ...invitation,
    role_name: roleById.get(invitation.role_id) ?? null,
  }));
}

export async function fetchRoles(): Promise<Role[]> {
  const supabase = getSupabase();
  return unwrap<Role[]>(await supabase.from('roles').select('*').order('name_he'));
}

/**
 * What each role grants by default, keyed by role id.
 *
 * This mirrors `role_permissions` exactly rather than a hardcoded copy of the
 * seed data — the approval screen's checkbox defaults come from the same
 * table `has_permission()` reads, so they can never drift from what the
 * database will actually enforce.
 */
export async function fetchRolePermissions(): Promise<Map<string, string[]>> {
  const supabase = getSupabase();
  const rows = unwrap<{ role_id: string; permission: string }[]>(
    await supabase.from('role_permissions').select('role_id, permission'),
  );
  const byRole = new Map<string, string[]>();
  for (const row of rows) {
    const list = byRole.get(row.role_id) ?? [];
    list.push(row.permission);
    byRole.set(row.role_id, list);
  }
  return byRole;
}

/* ------------------------------------------------------------------ writes */

/** Issues an invitation. The plaintext code comes back exactly once. */
export async function createInvitation(input: {
  orgId: string;
  email: string;
  roleId: string;
  validForDays: number;
  accessUntil: string | null;
}): Promise<{ invitationId: string; code: string }> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('create_invitation', {
    target_org: input.orgId,
    invite_email: input.email,
    invite_role_id: input.roleId,
    valid_for: `${input.validForDays} days`,
    access_until: input.accessUntil,
  });
  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('הנפקת הקוד לא החזירה תוצאה.');
  return { invitationId: row.invitation_id, code: row.code };
}

/**
 * Activates a membership.
 *
 * `confirmRoleId` is restated on purpose — the database rejects the call when
 * it does not match what is on the row, so approving from a screen that has
 * gone stale fails loudly instead of granting something unintended.
 */
export async function approveMembership(input: {
  membershipId: string;
  confirmRoleId: string;
  grant: string[];
  revoke: string[];
}): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('approve_membership', {
    target_membership: input.membershipId,
    confirm_role_id: input.confirmRoleId,
    grant_permissions: input.grant,
    revoke_permissions: input.revoke,
  });
  if (error) throw new Error(error.message);
}

export async function suspendMembership(membershipId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('memberships')
    .update({ status: 'suspended' })
    .eq('id', membershipId);
  if (error) throw new Error(error.message);
}

/** Rejects a registration that never should have been approved. */
export async function revokeMembership(membershipId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('memberships')
    .update({ status: 'revoked' })
    .eq('id', membershipId);
  if (error) throw new Error(error.message);
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('invitations')
    .update({ status: 'revoked' })
    .eq('id', invitationId);
  if (error) throw new Error(error.message);
}
