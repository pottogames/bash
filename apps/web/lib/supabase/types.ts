/**
 * Database types.
 *
 * Written by hand against `supabase/migrations` rather than generated, so the
 * repository has no build step that depends on a live project. Only the tables
 * and columns the app actually reads are listed — a partial but accurate map is
 * more useful than a complete one nobody keeps in step.
 *
 * Every row shape below is a `type`, never an `interface`. The Supabase client
 * checks each one against `Record<string, unknown>` to build its query types,
 * and TypeScript only grants an object type that implicit index signature when
 * it is a type literal — an `interface` never structurally satisfies
 * `Record<string, unknown>`, even with identical fields. Get this wrong and
 * every table silently resolves to `never` with no error at the point of the
 * mistake, only at every place a row is later used. `supabase gen types` always
 * emits `type`, never `interface`, which is this file's evidence that the rule
 * is real.
 *
 * Regenerate the full set at any time with:
 *   npx supabase gen types typescript --project-id <id> > lib/supabase/types.gen.ts
 */

export type MembershipStatus = 'pending_approval' | 'active' | 'suspended' | 'expired' | 'revoked';
export type InvitationStatus = 'pending' | 'redeemed' | 'expired' | 'revoked';
export type MeasureType = 'length' | 'area' | 'volume' | 'count' | 'weight';
export type SheetKind =
  | 'floor_plan'
  | 'detail_sheet'
  | 'section'
  | 'elevation'
  | 'site_plan'
  | 'schedule'
  | 'unknown';
export type PlanFormat = 'dxf' | 'dwg' | 'pdf_vector' | 'ifc' | 'raster';
export type PlanStatus = 'uploaded' | 'queued' | 'parsing' | 'parsed' | 'failed' | 'superseded';
export type ScaleSource =
  | 'native_units'
  | 'ifc_units'
  | 'dimension_inference'
  | 'manual_calibration'
  | 'unknown';
export type ZoneKind =
  | 'apartment'
  | 'lobby'
  | 'parking'
  | 'core'
  | 'shaft'
  | 'storage'
  | 'commercial'
  | 'technical'
  | 'shelter'
  | 'roof'
  | 'outdoor'
  | 'common';

export type Organization = {
  id: string;
  name: string;
  slug: string;
};

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  company_name: string | null;
};

export type Role = {
  id: string;
  key: string;
  name_he: string;
  name_en: string;
  description: string | null;
  is_system: boolean;
  org_id: string | null;
};

export type Membership = {
  id: string;
  org_id: string;
  user_id: string;
  role_id: string;
  status: MembershipStatus;
  access_expires_at: string | null;
  approved_at: string | null;
  created_at: string;
};

export type Invitation = {
  id: string;
  org_id: string;
  email: string;
  code_hint: string;
  role_id: string;
  status: InvitationStatus;
  expires_at: string;
  access_expires_at: string | null;
  created_at: string;
};

export type Project = {
  id: string;
  org_id: string;
  name: string;
  code: string | null;
  client_name: string | null;
  city: string | null;
  status: string;
  default_storey_height_m: number | null;
  currency: string;
  vat_rate: number;
  created_at: string;
};

export type Building = {
  id: string;
  project_id: string;
  name: string;
  code: string | null;
  sort_order: number;
};

export type Floor = {
  id: string;
  building_id: string;
  level: number;
  name: string;
  elevation_m: number | null;
  storey_height_m: number | null;
  gross_area_m2: number | null;
  net_area_m2: number | null;
  repeat_count: number;
  sort_order: number;
};

export type Zone = {
  id: string;
  floor_id: string;
  kind: ZoneKind;
  name: string;
  gross_area_m2: number | null;
  net_area_m2: number | null;
  balcony_area_m2: number | null;
  perimeter_m: number | null;
  room_count: number | null;
  sort_order: number;
};

export type Trade = {
  id: string;
  key: string;
  name_he: string;
  name_en: string;
  color: string;
  default_measure: MeasureType;
  billable: boolean;
  sort_order: number;
  org_id: string | null;
};

export type Plan = {
  id: string;
  project_id: string;
  building_id: string | null;
  floor_id: string | null;
  batch_id: string | null;
  name: string;
  original_filename: string;
  format: PlanFormat;
  status: PlanStatus;
  storage_path: string;
  file_size_bytes: number | null;
  sheet_kind: SheetKind;
  measurable: boolean;
  sheet_kind_source: 'detector' | 'manual';
  sheet_kind_reasons: string[];
  scale_notations: string[];
  scale_source: ScaleSource;
  metres_per_source_unit: number;
  scale_confidence: number;
  scale_reason: string | null;
  created_at: string;
};

export type PlanLayer = {
  id: string;
  plan_id: string;
  source_key: string;
  source_name: string;
  display_name: string | null;
  trade_id: string | null;
  measure_type: MeasureType;
  classification_source: string;
  confidence: number;
  evidence: { kind: string; matched: string; weight: number; explanation: string }[];
  floor_id: string | null;
  zone_id: string | null;
  color: string | null;
  visible: boolean;
  frozen: boolean;
  entity_count: number;
  excluded: boolean;
};

export type QuantityLine = {
  id: string;
  project_id: string;
  plan_id: string | null;
  layer_id: string | null;
  floor_id: string | null;
  zone_id: string | null;
  trade_id: string | null;
  description: string;
  measure_type: MeasureType;
  unit: string;
  value: number;
  floor_multiplier: number;
  waste_factor: number;
  provenance_entity_ids: string[];
  warnings: { code: string; message: string }[];
  is_manual: boolean;
  approved: boolean;
};

export type UploadBatch = {
  id: string;
  project_id: string;
  name: string | null;
  note: string | null;
  file_count: number;
  created_at: string;
};

export type PriceBook = {
  id: string;
  org_id: string;
  name: string;
  currency: string;
  is_default: boolean;
  effective_from: string;
};

export type PriceItem = {
  id: string;
  price_book_id: string;
  trade_id: string | null;
  code: string | null;
  description: string;
  unit: string;
  cost_price: number | null;
  default_margin: number;
  density_kg_per_m3: number | null;
};

export type RolePermission = {
  role_id: string;
  permission: string;
};

/**
 * Every table also needs a `Relationships` array to satisfy the client's
 * `GenericTable` constraint — same "type, not interface" story: omit it and
 * every row silently becomes `never` instead of failing to compile where the
 * mistake was made. `Table<Row>` bakes both requirements in so neither can be
 * forgotten per-table.
 */
type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };

/**
 * Minimal shape `SupabaseClient` needs. Only the tables the app touches are
 * declared; anything else still works, it just is not type-checked.
 *
 * `__InternalSupabase` is not a real schema — it is metadata the client
 * library's generic resolution reads to pick the right overloads. Without it,
 * table lookups fall back to a less precise default. `supabase gen types`
 * always emits it; this hand-written file has to as well.
 */
export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '12';
  };
  public: {
    Tables: {
      organizations: Table<Organization>;
      profiles: Table<Profile>;
      roles: Table<Role>;
      memberships: Table<Membership>;
      invitations: Table<Invitation>;
      projects: Table<Project>;
      buildings: Table<Building>;
      floors: Table<Floor>;
      zones: Table<Zone>;
      trades: Table<Trade>;
      plans: Table<Plan>;
      plan_layers: Table<PlanLayer>;
      quantity_lines: Table<QuantityLine>;
      upload_batches: Table<UploadBatch>;
      price_books: Table<PriceBook>;
      price_items: Table<PriceItem>;
      role_permissions: Table<RolePermission>;
    };
    Views: Record<string, never>;
    Functions: {
      create_invitation: {
        Args: {
          target_org: string;
          invite_email: string;
          invite_role_id: string;
          valid_for?: string;
          extra?: string[];
          denied?: string[];
          access_until?: string | null;
        };
        Returns: { invitation_id: string; code: string }[];
      };
      redeem_invitation: {
        Args: { code: string };
        Returns: string;
      };
      approve_membership: {
        Args: {
          target_membership: string;
          confirm_role_id: string;
          grant_permissions?: string[];
          revoke_permissions?: string[];
        };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
