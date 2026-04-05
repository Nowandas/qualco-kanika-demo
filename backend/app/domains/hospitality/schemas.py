from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class UploadLimitsRead(BaseModel):
    contract_mb: int = Field(ge=1, le=100)
    promotion_mb: int = Field(ge=1, le=100)
    reconciliation_mb: int = Field(ge=1, le=100)
    pricing_ai_mb: int = Field(ge=1, le=100)
    updated_at: datetime | None = None
    updated_by_user_id: str | None = None


class UploadLimitsUpdateRequest(BaseModel):
    contract_mb: int = Field(ge=1, le=100)
    promotion_mb: int = Field(ge=1, le=100)
    reconciliation_mb: int = Field(ge=1, le=100)
    pricing_ai_mb: int = Field(ge=1, le=100)


class ContractExtraction(BaseModel):
    room_types: list[str] = Field(default_factory=list)
    seasonal_periods: list[str] = Field(default_factory=list)
    board_types: list[str] = Field(default_factory=list)
    discounts: list[str] = Field(default_factory=list)
    supplements: list[str] = Field(default_factory=list)
    marketing_contributions: list[str] = Field(default_factory=list)
    raw_highlights: list[str] = Field(default_factory=list)


class ContractDocumentRead(BaseModel):
    id: str
    file_name: str
    file_type: str
    file_size: int
    has_uploaded_file: bool = False
    hotel_id: str | None = None
    hotel_code: str
    operator_code: str
    season_label: str | None = None
    source: Literal["upload", "seed"] = "upload"
    uploaded_by_user_id: str
    extraction: ContractExtraction
    parsed_text_preview: str
    created_at: datetime
    updated_at: datetime


class ContractPathIngestionRequest(BaseModel):
    paths: list[str] = Field(min_length=1, max_length=50)
    hotel_id: str | None = None
    hotel_code: str | None = Field(default=None, min_length=2, max_length=50)
    operator_code: str = Field(min_length=2, max_length=50)
    season_label: str | None = Field(default=None, max_length=80)


class PromotionOfferRead(BaseModel):
    id: str
    file_name: str
    hotel_id: str | None = None
    hotel_code: str
    operator_code: str
    offer_name: str
    description: str
    discount_percent: float | None = None
    start_date: date | None = None
    end_date: date | None = None
    booking_start_date: date | None = None
    booking_end_date: date | None = None
    arrival_start_date: date | None = None
    arrival_end_date: date | None = None
    non_cumulative: bool | None = None
    combinability_note: str | None = None
    applicable_room_types: list[str] = Field(default_factory=list)
    applicable_board_types: list[str] = Field(default_factory=list)
    affected_contract_ids: list[str] = Field(default_factory=list)
    ingestion_mode: str | None = None
    analysis_provider: Literal["openai"] | None = None
    analysis_model: str | None = None
    analysis_usage: dict[str, Any] = Field(default_factory=dict)
    scope: str = "all"
    created_at: datetime
    updated_at: datetime


class PromotionAIContractUpdateRead(BaseModel):
    contract_id: str
    contract_file_name: str
    promotion_rule_added: bool
    total_rules_after_update: int


class PromotionAIIngestRead(BaseModel):
    promotion: PromotionOfferRead
    analysis_summary: str
    impacted_contract_ids: list[str] = Field(default_factory=list)
    contract_rule_updates: list[PromotionAIContractUpdateRead] = Field(default_factory=list)


class PromotionPathIngestionRequest(BaseModel):
    paths: list[str] = Field(min_length=1, max_length=50)
    hotel_id: str | None = None
    hotel_code: str | None = Field(default=None, min_length=2, max_length=50)
    operator_code: str = Field(min_length=2, max_length=50)


class RuleGenerationRequest(BaseModel):
    contract_id: str
    include_promotions: bool = True


class PricingRuleRead(BaseModel):
    id: str
    contract_id: str
    hotel_id: str | None = None
    name: str
    rule_type: Literal["base_rate", "child_discount", "extra_guest_adjustment", "promotion"]
    expression: str
    priority: int = 100
    is_active: bool = True
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class SyncRequest(BaseModel):
    contract_id: str
    target_system: Literal["fidelio", "third_party_tool"] = "fidelio"
    dry_run: bool = False


class SyncRunRead(BaseModel):
    id: str
    contract_id: str
    hotel_id: str | None = None
    target_system: str
    status: Literal["dry_run", "synced", "failed"]
    payload: dict[str, Any] = Field(default_factory=dict)
    details: dict[str, Any] = Field(default_factory=dict)
    created_by_user_id: str
    created_at: datetime
    updated_at: datetime


class PricingRuleDraft(BaseModel):
    name: str
    rule_type: Literal["base_rate", "child_discount", "extra_guest_adjustment", "promotion"]
    expression: str
    priority: int = 100
    metadata: dict[str, Any] = Field(default_factory=dict)


class AIPricingDatabaseMappingRead(BaseModel):
    target_entity: str
    source_path: str
    destination_field: str
    transform: str
    required: bool = True
    note: str | None = None


class AIPricingContentRecommendationRead(BaseModel):
    file_name: str
    file_type: str
    file_size: int
    hotel_id: str | None = None
    hotel_code: str | None = None
    operator_code: str
    season_label: str | None = None
    analysis_provider: Literal["openai"] = "openai"
    analysis_model: str
    analysis_usage: dict[str, Any] = Field(default_factory=dict)
    content_summary: str
    confidence: Literal["low", "medium", "high"]
    detected_signals: dict[str, Any] = Field(default_factory=dict)
    coverage_feedback: list[str] = Field(default_factory=list)
    recommended_data: dict[str, Any] = Field(default_factory=dict)
    suggested_schema: dict[str, Any] = Field(default_factory=dict)
    suggested_schema_rationale: str
    suggested_mapping_instructions: str
    database_mapping: list[AIPricingDatabaseMappingRead] = Field(default_factory=list)


class AIPricingExtractionRead(BaseModel):
    id: str
    file_name: str
    file_size: int
    file_type: str
    hotel_id: str | None = None
    hotel_code: str
    operator_code: str
    season_label: str | None = None
    model: str
    parsed_text_preview: str
    extracted_data: dict[str, Any] = Field(default_factory=dict)
    normalized_extraction: ContractExtraction
    suggested_rules: list[PricingRuleDraft] = Field(default_factory=list)
    schema_used: dict[str, Any] = Field(default_factory=dict)
    usage: dict[str, Any] = Field(default_factory=dict)
    created_by_user_id: str
    created_at: datetime


class AIPricingPersistRequest(BaseModel):
    extraction_run_id: str
    hotel_id: str | None = None
    hotel_code: str | None = Field(default=None, min_length=2, max_length=50)
    operator_code: str = Field(min_length=2, max_length=50)
    season_label: str | None = Field(default=None, max_length=80)
    reviewed_data: dict[str, Any] | None = None


class AIPricingPersistResponse(BaseModel):
    contract: ContractDocumentRead
    created_rules: list[PricingRuleRead] = Field(default_factory=list)
    extraction_run_id: str
    model: str


class PriceListPeriodRead(BaseModel):
    label: str
    start_date: date | None = None
    end_date: date | None = None


class PriceListEntryRead(BaseModel):
    room_type: str
    board_type: str
    age_bucket: str
    age_label: str
    age_category: Literal["adult", "child", "infant", "senior", "unknown"] = "unknown"
    age_min: int | None = None
    age_max: int | None = None
    period_label: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    price: float
    currency: str | None = None
    source_rule_type: str
    source_rule_name: str | None = None
    base_price: float | None = None
    delta_amount: float | None = None
    delta_percent: float | None = None
    promotion_applied: bool = False
    applied_promotions: list[str] = Field(default_factory=list)


class PriceListMatrixRead(BaseModel):
    contract_id: str
    contract_file_name: str
    hotel_id: str | None = None
    hotel_code: str
    operator_code: str
    season_label: str | None = None
    period_ranges: list[PriceListPeriodRead] = Field(default_factory=list)
    room_types: list[str] = Field(default_factory=list)
    board_types: list[str] = Field(default_factory=list)
    age_buckets: list[str] = Field(default_factory=list)
    currencies: list[str] = Field(default_factory=list)
    include_promotions: bool = False
    selected_promotion_ids: list[str] = Field(default_factory=list)
    applied_promotion_ids: list[str] = Field(default_factory=list)
    applied_promotion_names: list[str] = Field(default_factory=list)
    entries: list[PriceListEntryRead] = Field(default_factory=list)


class ValidationLineInput(BaseModel):
    reservation_id: str = Field(min_length=2, max_length=100)
    hotel_code: str = Field(min_length=2, max_length=50)
    operator_code: str = Field(min_length=2, max_length=50)
    contract_id: str
    room_type: str = Field(min_length=2, max_length=120)
    board_type: str = Field(min_length=1, max_length=80)
    stay_date: date
    nights: int = Field(default=1, ge=1, le=60)
    pax_adults: int = Field(default=2, ge=1, le=10)
    pax_children: int = Field(default=0, ge=0, le=10)
    actual_price: float = Field(ge=0)
    contract_rate: float | None = Field(default=None, ge=0)
    promo_code: str | None = Field(default=None, max_length=50)


class ValidationBatchRequest(BaseModel):
    contract_id: str
    run_label: str | None = Field(default=None, max_length=120)
    tolerance_amount: float = Field(default=1.0, ge=0)
    tolerance_percent: float = Field(default=1.0, ge=0)
    lines: list[ValidationLineInput] = Field(default_factory=list, min_length=1, max_length=1000)


class ReconciliationExtractionRead(BaseModel):
    file_name: str
    contract_id: str
    line_count: int
    lines: list[ValidationLineInput] = Field(default_factory=list)


class ReconciliationSheetPreviewRead(BaseModel):
    sheet_name: str
    total_rows: int
    non_empty_rows: int
    column_count: int
    detected_header_row: int | None = None
    detected_fields: list[str] = Field(default_factory=list)
    confidence: float = 0.0
    sample_headers: list[str] = Field(default_factory=list)
    sample_rows: list[list[str]] = Field(default_factory=list)


class ReconciliationWorkbookPreviewRead(BaseModel):
    file_name: str
    contract_id: str
    sheet_count: int
    suggested_sheet_name: str | None = None
    sheets: list[ReconciliationSheetPreviewRead] = Field(default_factory=list)


class ReconciliationAIMappingRead(BaseModel):
    file_name: str
    contract_id: str
    sheet_name: str
    source_system: str | None = None
    reservation_id_column: str | None = None
    analysis_provider: Literal["openai"] = "openai"
    analysis_model: str
    analysis_usage: dict[str, Any] = Field(default_factory=dict)
    mapping_summary: str
    header_mapping: dict[str, str] = Field(default_factory=dict)
    line_count: int
    lines: list[ValidationLineInput] = Field(default_factory=list)


class ReconciliationImportPersistRequest(BaseModel):
    file_name: str = Field(min_length=1, max_length=255)
    contract_id: str
    sheet_name: str = Field(min_length=1, max_length=180)
    source_system: str | None = Field(default=None, max_length=80)
    reservation_id_column: str | None = Field(default=None, max_length=180)
    mapping_summary: str | None = Field(default=None, max_length=2000)
    analysis_provider: Literal["openai"] | None = None
    analysis_model: str | None = Field(default=None, max_length=120)
    analysis_usage: dict[str, Any] = Field(default_factory=dict)
    lines: list[ValidationLineInput] = Field(default_factory=list, min_length=1, max_length=5000)


class ReconciliationImportRead(BaseModel):
    id: str
    contract_id: str
    hotel_id: str | None = None
    hotel_code: str
    operator_code: str
    file_name: str
    sheet_name: str
    source_system: str | None = None
    reservation_id_column: str | None = None
    mapping_summary: str | None = None
    analysis_provider: Literal["openai"] | None = None
    analysis_model: str | None = None
    analysis_usage: dict[str, Any] = Field(default_factory=dict)
    line_count: int
    created_by_user_id: str
    created_at: datetime


class ReconciliationReservationRead(BaseModel):
    id: str
    import_id: str
    contract_id: str
    hotel_id: str | None = None
    hotel_code: str
    operator_code: str
    file_name: str
    sheet_name: str | None = None
    source_system: str | None = None
    reservation_id: str
    room_type: str
    board_type: str
    stay_date: date
    nights: int
    pax_adults: int
    pax_children: int
    actual_price: float
    contract_rate: float | None = None
    promo_code: str | None = None
    created_at: datetime


class ReconciliationReservationListRead(BaseModel):
    total: int
    items: list[ReconciliationReservationRead] = Field(default_factory=list)


class ReconciliationReservationDeleteRead(BaseModel):
    deleted: bool
    reservation_row_id: str
    import_id: str | None = None
    remaining_import_rows: int | None = None


class ReconciliationReservationBulkDeleteRead(BaseModel):
    deleted: bool
    deleted_count: int
    contract_id: str
    hotel_id: str | None = None
    import_id: str | None = None
    remaining_imports_updated: int = 0


class ValidationLineResult(BaseModel):
    reservation_id: str
    hotel_code: str
    operator_code: str
    room_type: str
    board_type: str
    stay_date: date
    nights: int = 1
    pax_adults: int = 2
    pax_children: int = 0
    promo_code: str | None = None
    expected_price: float
    actual_price: float
    variance_amount: float
    variance_percent: float
    status: Literal["match", "mismatch"]
    reason: str
    applied_promotions: list[str] = Field(default_factory=list)
    applied_rules: list[str] = Field(default_factory=list)
    expected_calculation: dict[str, Any] | None = None


class ValidationRunRead(BaseModel):
    id: str
    contract_id: str
    hotel_id: str | None = None
    run_label: str | None = None
    total_lines: int
    match_count: int
    mismatch_count: int
    mismatch_rate: float
    created_by_user_id: str
    created_at: datetime
    results: list[ValidationLineResult] = Field(default_factory=list)


class AlertRead(BaseModel):
    id: str
    validation_run_id: str
    contract_id: str
    hotel_id: str | None = None
    reservation_id: str
    hotel_code: str
    operator_code: str
    severity: Literal["medium", "high"]
    status: Literal["open", "resolved"]
    message: str
    details: dict[str, Any] = Field(default_factory=dict)
    resolution_note: str | None = None
    created_at: datetime
    resolved_at: datetime | None = None
    resolved_by_user_id: str | None = None


class AlertResolveRequest(BaseModel):
    resolution_note: str = Field(min_length=2, max_length=500)


class DiscrepancyReportRow(BaseModel):
    operator_code: str
    hotel_code: str
    total_validations: int
    mismatches: int
    mismatch_rate: float
    total_variance_amount: float
    latest_mismatch_at: datetime | None = None


class ContractPerformanceReportRow(BaseModel):
    contract_id: str
    operator_code: str
    hotel_code: str
    total_runs: int
    total_lines: int
    mismatch_rate: float
    last_run_at: datetime | None = None


class OperatorReportRow(BaseModel):
    operator_code: str
    total_contracts: int
    total_runs: int
    total_mismatches: int
    total_variance_amount: float


class HospitalityOverviewRead(BaseModel):
    contract_count: int
    promotion_count: int
    rules_count: int
    sync_runs_count: int
    validation_runs_count: int
    open_alerts_count: int
    mismatch_rate: float
