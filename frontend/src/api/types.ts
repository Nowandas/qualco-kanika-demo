export type UserRole = "admin" | "staff" | "member";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  avatar_seed?: string | null;
  avatar_style: string;
  created_at: string;
  updated_at: string;
}

export interface UploadLimits {
  contract_mb: number;
  promotion_mb: number;
  reconciliation_mb: number;
  pricing_ai_mb: number;
  updated_at?: string | null;
  updated_by_user_id?: string | null;
}

export interface UploadLimitsUpdatePayload {
  contract_mb: number;
  promotion_mb: number;
  reconciliation_mb: number;
  pricing_ai_mb: number;
}

export interface Invitation {
  id: string;
  email: string;
  role: UserRole;
  token_hint?: string | null;
  expires_at: string;
  accepted_at?: string | null;
  created_by_user_id: string;
  created_at: string;
}

export interface InvitationCreateResult extends Invitation {
  token: string;
}

export interface InvitationTokenIssueResult extends Invitation {
  token: string;
  issued_at: string;
}

export interface PasswordResetLink {
  id: string;
  user_id: string;
  user_email: string;
  user_full_name: string;
  token: string;
  expires_at: string;
  consumed_at?: string | null;
  revoked_at?: string | null;
  created_by_user_id: string;
  created_at: string;
}

export interface PasswordResetTokenContext {
  user_id: string;
  user_email: string;
  user_full_name: string;
  expires_at: string;
}

export interface Hotel {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContractExtraction {
  room_types: string[];
  seasonal_periods: string[];
  board_types: string[];
  discounts: string[];
  supplements: string[];
  marketing_contributions: string[];
  raw_highlights: string[];
}

export interface ContractDocument {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  has_uploaded_file?: boolean;
  hotel_id?: string | null;
  hotel_code: string;
  operator_code: string;
  season_label?: string | null;
  source: "upload" | "seed";
  uploaded_by_user_id: string;
  extraction: ContractExtraction;
  parsed_text_preview: string;
  ai_extraction_run_id?: string | null;
  ingestion_mode?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PromotionOffer {
  id: string;
  file_name: string;
  hotel_id?: string | null;
  hotel_code: string;
  operator_code: string;
  offer_name: string;
  description: string;
  discount_percent?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  booking_start_date?: string | null;
  booking_end_date?: string | null;
  arrival_start_date?: string | null;
  arrival_end_date?: string | null;
  non_cumulative?: boolean | null;
  combinability_note?: string | null;
  promotion_category?: string | null;
  applicable_room_types: string[];
  applicable_board_types: string[];
  affected_contract_ids: string[];
  ingestion_mode?: string | null;
  analysis_provider?: "openai" | null;
  analysis_model?: string | null;
  analysis_usage?: Record<string, unknown>;
  scope: string;
  created_at: string;
  updated_at: string;
}

export interface PromotionAIContractUpdate {
  contract_id: string;
  contract_file_name: string;
  promotion_rule_added: boolean;
  total_rules_after_update: number;
}

export interface PromotionAIIngestResponse {
  promotion: PromotionOffer;
  analysis_summary: string;
  impacted_contract_ids: string[];
  contract_rule_updates: PromotionAIContractUpdate[];
}

export interface PricingRule {
  id: string;
  contract_id: string;
  hotel_id?: string | null;
  name: string;
  rule_type: "base_rate" | "child_discount" | "extra_guest_adjustment" | "promotion";
  expression: string;
  priority: number;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PricingRuleDraft {
  name: string;
  rule_type: "base_rate" | "child_discount" | "extra_guest_adjustment" | "promotion";
  expression: string;
  priority: number;
  metadata: Record<string, unknown>;
}

export interface AIPricingDatabaseMapping {
  target_entity: string;
  source_path: string;
  destination_field: string;
  transform: string;
  required: boolean;
  note?: string | null;
}

export interface AIPricingContentRecommendation {
  file_name: string;
  file_type: string;
  file_size: number;
  hotel_id?: string | null;
  hotel_code?: string | null;
  operator_code: string;
  season_label?: string | null;
  analysis_provider: "openai";
  analysis_model: string;
  analysis_usage: Record<string, unknown>;
  content_summary: string;
  confidence: "low" | "medium" | "high";
  detected_signals: Record<string, unknown>;
  coverage_feedback: string[];
  recommended_data: Record<string, unknown>;
  suggested_schema: Record<string, unknown>;
  suggested_schema_rationale: string;
  suggested_mapping_instructions: string;
  database_mapping: AIPricingDatabaseMapping[];
}

export interface AIPricingExtractionRun {
  id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  hotel_id?: string | null;
  hotel_code: string;
  operator_code: string;
  season_label?: string | null;
  model: string;
  parsed_text_preview: string;
  extracted_data: Record<string, unknown>;
  normalized_extraction: ContractExtraction;
  suggested_rules: PricingRuleDraft[];
  schema_used: Record<string, unknown>;
  usage: Record<string, unknown>;
  created_by_user_id: string;
  created_at: string;
}

export interface AIPricingPersistResponse {
  contract: ContractDocument;
  created_rules: PricingRule[];
  extraction_run_id: string;
  model: string;
}

export interface PriceListPeriod {
  label: string;
  start_date?: string | null;
  end_date?: string | null;
}

export interface PriceListEntry {
  room_type: string;
  board_type: string;
  age_bucket: string;
  age_label: string;
  age_category: "adult" | "child" | "infant" | "senior" | "unknown";
  age_min?: number | null;
  age_max?: number | null;
  period_label?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  price: number;
  currency?: string | null;
  source_rule_type: string;
  source_rule_name?: string | null;
  base_price?: number | null;
  delta_amount?: number | null;
  delta_percent?: number | null;
  promotion_applied?: boolean;
  applied_promotions?: string[];
}

export interface PriceListMatrix {
  contract_id: string;
  contract_file_name: string;
  hotel_id?: string | null;
  hotel_code: string;
  operator_code: string;
  season_label?: string | null;
  period_ranges: PriceListPeriod[];
  room_types: string[];
  board_types: string[];
  age_buckets: string[];
  currencies: string[];
  include_promotions?: boolean;
  booking_date?: string | null;
  selected_promotion_ids?: string[];
  applied_promotion_ids?: string[];
  applied_promotion_names?: string[];
  entries: PriceListEntry[];
}

export interface SyncRun {
  id: string;
  contract_id: string;
  hotel_id?: string | null;
  target_system: string;
  status: "dry_run" | "synced" | "failed";
  payload: Record<string, unknown>;
  details: Record<string, unknown>;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface ValidationLineInput {
  reservation_id: string;
  hotel_code: string;
  operator_code: string;
  contract_id: string;
  room_type: string;
  board_type: string;
  booking_date?: string | null;
  stay_date: string;
  nights: number;
  pax_adults: number;
  pax_children: number;
  actual_price: number;
  contract_rate?: number;
  promo_code?: string;
}

export interface ValidationLineResult {
  reservation_id: string;
  hotel_code: string;
  operator_code: string;
  room_type: string;
  board_type: string;
  booking_date?: string | null;
  stay_date: string;
  nights: number;
  pax_adults: number;
  pax_children: number;
  promo_code?: string | null;
  expected_price: number;
  actual_price: number;
  variance_amount: number;
  variance_percent: number;
  status: "match" | "mismatch";
  reason: string;
  applied_promotions: string[];
  applied_rules: string[];
  expected_calculation?: {
    base_rate: number;
    base_rate_source: string;
    source_details?: string;
    room_board_key: string;
    nights: number;
    base_adult_units?: number;
    base_subtotal: number;
    missing_base_rate_dates?: string[];
    available_board_types?: string[];
    nightly_base_rates?: Array<{
      date: string;
      rate: number;
      source: string;
      source_key: string;
      period_label?: string | null;
      source_rule_name?: string | null;
      pricelist_room_type?: string | null;
      pricelist_board_type?: string | null;
      base_adult_unit_rate?: number;
      base_adult_units?: number;
      base_adult_subtotal?: number;
      board_supplement_amount?: number;
      base_board_type?: string | null;
      supplement_rule_name?: string | null;
      supplement_source_text?: string | null;
    }>;
    board_supplement_adjustments?: Array<{
      target_board_type: string;
      source_board_type?: string | null;
      rule_name: string;
      unit_amount: number;
      nights_applied: number;
      subtotal_amount: number;
      dates_count: number;
    }>;
    guest_adjustments?: Array<{
      guest_type: "child" | "adult_extra" | string;
      age_bucket: string;
      rule_name: string;
      unit_rate: number;
      units: number;
      subtotal_amount: number;
      guest_positions: number[];
      dates_count: number;
    }>;
    child_discount?: {
      applied: boolean;
      children_count: number;
      discount_percent: number;
      multiplier: number;
      subtotal_before: number;
      adjustment_amount: number;
      subtotal_after: number;
    };
    promotion_adjustments?: Array<{
      offer_name: string;
      discount_percent: number;
      multiplier: number;
      subtotal_before: number;
      adjustment_amount: number;
      subtotal_after: number;
    }>;
    final_expected_price: number;
  } | null;
}

export interface ValidationRun {
  id: string;
  contract_id: string;
  hotel_id?: string | null;
  run_label?: string | null;
  total_lines: number;
  match_count: number;
  mismatch_count: number;
  mismatch_rate: number;
  created_by_user_id: string;
  created_at: string;
  results: ValidationLineResult[];
}

export interface ReconciliationExtraction {
  file_name: string;
  contract_id: string;
  line_count: number;
  lines: ValidationLineInput[];
}

export interface ReconciliationSheetPreview {
  sheet_name: string;
  total_rows: number;
  non_empty_rows: number;
  column_count: number;
  detected_header_row?: number | null;
  detected_fields: string[];
  confidence: number;
  sample_headers: string[];
  sample_rows: string[][];
}

export interface ReconciliationWorkbookPreview {
  file_name: string;
  contract_id: string;
  sheet_count: number;
  suggested_sheet_name?: string | null;
  sheets: ReconciliationSheetPreview[];
}

export interface ReconciliationAIMapping {
  file_name: string;
  contract_id: string;
  sheet_name: string;
  source_system?: string | null;
  reservation_id_column?: string | null;
  analysis_provider: "openai";
  analysis_model: string;
  analysis_usage?: Record<string, number>;
  mapping_summary: string;
  header_mapping: Record<string, string>;
  line_count: number;
  lines: ValidationLineInput[];
}

export interface ReconciliationImport {
  id: string;
  contract_id: string;
  hotel_id?: string | null;
  hotel_code: string;
  operator_code: string;
  file_name: string;
  sheet_name: string;
  source_system?: string | null;
  reservation_id_column?: string | null;
  mapping_summary?: string | null;
  analysis_provider?: "openai" | null;
  analysis_model?: string | null;
  analysis_usage?: Record<string, number>;
  ingestion_mode?: "v1_replace" | "v2_append" | null;
  line_count: number;
  created_by_user_id: string;
  created_at: string;
}

export interface ReconciliationReservation {
  id: string;
  import_id: string;
  contract_id: string;
  hotel_id?: string | null;
  hotel_code: string;
  operator_code: string;
  file_name: string;
  sheet_name?: string | null;
  source_system?: string | null;
  reservation_id: string;
  reservation_group_key?: string | null;
  room_type: string;
  board_type: string;
  booking_date?: string | null;
  stay_date: string;
  nights: number;
  pax_adults: number;
  pax_children: number;
  actual_price: number;
  contract_rate?: number | null;
  promo_code?: string | null;
  created_at: string;
}

export interface ReconciliationReservationList {
  total: number;
  items: ReconciliationReservation[];
}

export interface ReconciliationReservationDeleteResult {
  deleted: boolean;
  reservation_row_id: string;
  import_id?: string | null;
  remaining_import_rows?: number | null;
}

export interface ReconciliationReservationBulkDeleteResult {
  deleted: boolean;
  deleted_count: number;
  contract_id: string;
  hotel_id?: string | null;
  import_id?: string | null;
  remaining_imports_updated: number;
}

export interface HospitalityAlert {
  id: string;
  validation_run_id: string;
  contract_id: string;
  hotel_id?: string | null;
  reservation_id: string;
  hotel_code: string;
  operator_code: string;
  severity: "medium" | "high";
  status: "open" | "resolved";
  message: string;
  details: Record<string, unknown>;
  resolution_note?: string | null;
  created_at: string;
  resolved_at?: string | null;
  resolved_by_user_id?: string | null;
}

export interface DiscrepancyReportRow {
  operator_code: string;
  hotel_code: string;
  total_validations: number;
  mismatches: number;
  mismatch_rate: number;
  total_variance_amount: number;
  latest_mismatch_at?: string | null;
}

export interface ContractPerformanceReportRow {
  contract_id: string;
  operator_code: string;
  hotel_code: string;
  total_runs: number;
  total_lines: number;
  mismatch_rate: number;
  last_run_at?: string | null;
}

export interface OperatorReportRow {
  operator_code: string;
  total_contracts: number;
  total_runs: number;
  total_mismatches: number;
  total_variance_amount: number;
}

export interface HospitalityOverview {
  contract_count: number;
  promotion_count: number;
  rules_count: number;
  sync_runs_count: number;
  validation_runs_count: number;
  open_alerts_count: number;
  mismatch_rate: number;
}
