import json
from datetime import date
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_db
from app.domains.auth.dependencies import require_admin
from app.domains.hospitality.schemas import (
    AIPricingContentRecommendationRead,
    AIPricingExtractionRead,
    AIPricingPersistRequest,
    AIPricingPersistResponse,
    AlertRead,
    AlertResolveRequest,
    ContractDataCleanupRead,
    ContractDocumentRead,
    ContractPathIngestionRequest,
    ContractPerformanceReportRow,
    DiscrepancyReportRow,
    HospitalityOverviewRead,
    OperatorReportRow,
    PriceListMatrixRead,
    PricingRuleRead,
    PromotionAIIngestRead,
    PromotionOfferRead,
    PromotionPathIngestionRequest,
    ReconciliationExtractionRead,
    ReconciliationAIMappingRead,
    ReconciliationImportPersistRequest,
    ReconciliationImportRead,
    ReconciliationReservationBulkDeleteRead,
    ReconciliationReservationDeleteRead,
    ReconciliationReservationListRead,
    ReconciliationWorkbookPreviewRead,
    RuleGenerationRequest,
    SyncRequest,
    SyncRunRead,
    UploadLimitsRead,
    UploadLimitsUpdateRequest,
    ValidationBatchRequest,
    ValidationRunRead,
)
from app.domains.hospitality.service import HospitalityService

router = APIRouter(prefix="/hospitality", tags=["hospitality"])
MAX_CONTRACT_BUNDLE_FILES = 20


@router.get("/overview", response_model=HospitalityOverviewRead, dependencies=[Depends(require_admin)])
async def overview(
    hotel_id: str | None = Query(default=None),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = HospitalityService(db)
    return await service.get_overview(hotel_id=hotel_id)


@router.get("/upload-limits", response_model=UploadLimitsRead, dependencies=[Depends(require_admin)])
async def get_upload_limits(
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = HospitalityService(db)
    return await service.get_upload_limits()


@router.patch("/upload-limits", response_model=UploadLimitsRead)
async def update_upload_limits(
    payload: UploadLimitsUpdateRequest,
    admin_user: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = HospitalityService(db)
    return await service.update_upload_limits(
        contract_mb=payload.contract_mb,
        promotion_mb=payload.promotion_mb,
        reconciliation_mb=payload.reconciliation_mb,
        pricing_ai_mb=payload.pricing_ai_mb,
        updated_by_user_id=admin_user["id"],
    )


@router.post("/admin/cleanup-contract-data", response_model=ContractDataCleanupRead)
async def cleanup_contract_data(
    admin_user: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = HospitalityService(db)
    return await service.cleanup_contract_related_data(deleted_by_user_id=admin_user["id"])


@router.post("/contracts/ingest", response_model=ContractDocumentRead)
async def ingest_contract_upload(
    file: UploadFile = File(...),
    hotel_id: str | None = Form(default=None),
    hotel_code: str | None = Form(default=None),
    operator_code: str = Form(...),
    season_label: str | None = Form(default=None),
    admin_user: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = HospitalityService(db)
    return await service.ingest_contract_upload(
        upload_file=file,
        hotel_id=hotel_id,
        hotel_code=hotel_code,
        operator_code=operator_code,
        season_label=season_label,
        uploaded_by_user_id=admin_user["id"],
    )


@router.post("/contracts/ingest-bundle", response_model=list[ContractDocumentRead])
async def ingest_contract_bundle(
    files: list[UploadFile] = File(...),
    hotel_id: str | None = Form(default=None),
    hotel_code: str | None = Form(default=None),
    operator_code: str = Form(...),
    season_label: str | None = Form(default=None),
    admin_user: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[dict]:
    if len(files) > MAX_CONTRACT_BUNDLE_FILES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Too many files in one bundle. Maximum allowed is {MAX_CONTRACT_BUNDLE_FILES}.",
        )

    service = HospitalityService(db)
    results: list[dict] = []
    for file in files:
        results.append(
            await service.ingest_contract_upload(
                upload_file=file,
                hotel_id=hotel_id,
                hotel_code=hotel_code,
                operator_code=operator_code,
                season_label=season_label,
                uploaded_by_user_id=admin_user["id"],
            )
        )
    return results


@router.post("/contracts/ingest-from-paths", response_model=list[ContractDocumentRead])
async def ingest_contract_from_paths(
    payload: ContractPathIngestionRequest,
    admin_user: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[dict]:
    service = HospitalityService(db)
    return await service.ingest_contracts_from_paths(payload, uploaded_by_user_id=admin_user["id"])


@router.get("/contracts", response_model=list[ContractDocumentRead], dependencies=[Depends(require_admin)])
async def list_contracts(
    q: str | None = Query(default=None),
    hotel_id: str | None = Query(default=None),
    hotel_code: str | None = Query(default=None),
    operator_code: str | None = Query(default=None),
    season_label: str | None = Query(default=None),
    source: Literal["upload", "seed"] | None = Query(default=None),
    sort_by: Literal[
        "created_at",
        "updated_at",
        "file_name",
        "file_size",
        "hotel_code",
        "operator_code",
        "season_label",
        "source",
    ] = Query(default="created_at"),
    sort_order: Literal["asc", "desc"] = Query(default="desc"),
    limit: int = Query(default=300, ge=1, le=1000),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[dict]:
    service = HospitalityService(db)
    return await service.list_contracts(
        search_text=q,
        hotel_id=hotel_id,
        hotel_code=hotel_code,
        operator_code=operator_code,
        season_label=season_label,
        source=source,
        sort_by=sort_by,
        sort_order=sort_order,
        limit=limit,
    )


@router.get("/contracts/{contract_id}", response_model=ContractDocumentRead, dependencies=[Depends(require_admin)])
async def get_contract(contract_id: str, db: AsyncIOMotorDatabase = Depends(get_db)) -> dict:
    service = HospitalityService(db)
    return await service.get_contract(contract_id)


@router.get("/contracts/{contract_id}/file", dependencies=[Depends(require_admin)])
async def get_contract_uploaded_file(contract_id: str, db: AsyncIOMotorDatabase = Depends(get_db)) -> Response:
    service = HospitalityService(db)
    file_data = await service.get_contract_uploaded_file(contract_id)
    file_name = str(file_data.get("file_name") or f"contract-{contract_id}")
    safe_file_name = file_name.replace("\\", "_").replace('"', "_").replace("\n", "_").replace("\r", "_")
    encoded_file_name = quote(file_name)
    disposition_type = "inline" if bool(file_data.get("inline_safe")) else "attachment"
    content_disposition = f'{disposition_type}; filename="{safe_file_name}"; filename*=UTF-8\'\'{encoded_file_name}'
    return Response(
        content=file_data.get("content", b""),
        media_type=str(file_data.get("content_type") or "application/octet-stream"),
        headers={
            "Content-Disposition": content_disposition,
            "Cache-Control": "no-store",
            "X-Download-Options": "noopen",
        },
    )


@router.get("/contracts/{contract_id}/price-matrix", response_model=PriceListMatrixRead, dependencies=[Depends(require_admin)])
async def get_contract_price_matrix(
    contract_id: str,
    include_promotions: bool = Query(default=False),
    promotion_ids: str | None = Query(default=None),
    booking_date: date | None = Query(default=None),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = HospitalityService(db)
    promotion_id_list = [item.strip() for item in (promotion_ids or "").split(",") if item and item.strip()]
    return await service.get_contract_price_matrix(
        contract_id=contract_id,
        include_promotions=include_promotions,
        promotion_ids=promotion_id_list,
        booking_date=booking_date,
    )


@router.post("/promotions/ingest", response_model=PromotionOfferRead)
async def ingest_promotion_upload(
    file: UploadFile = File(...),
    hotel_id: str | None = Form(default=None),
    hotel_code: str | None = Form(default=None),
    operator_code: str = Form(...),
    _: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = HospitalityService(db)
    return await service.ingest_promotion_upload(
        upload_file=file,
        hotel_id=hotel_id,
        hotel_code=hotel_code,
        operator_code=operator_code,
    )


@router.post("/promotions/ai-ingest", response_model=PromotionAIIngestRead)
async def ai_ingest_promotion_upload(
    file: UploadFile = File(...),
    hotel_id: str | None = Form(default=None),
    hotel_code: str | None = Form(default=None),
    operator_code: str = Form(...),
    contract_ids: list[str] | None = Form(default=None),
    admin_user: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = HospitalityService(db)
    return await service.ai_ingest_promotion_upload(
        upload_file=file,
        hotel_id=hotel_id,
        hotel_code=hotel_code,
        operator_code=operator_code,
        contract_ids=contract_ids,
        created_by_user_id=admin_user["id"],
    )


@router.post("/promotions/ingest-from-paths", response_model=list[PromotionOfferRead])
async def ingest_promotions_from_paths(
    payload: PromotionPathIngestionRequest,
    _: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[dict]:
    service = HospitalityService(db)
    return await service.ingest_promotions_from_paths(payload)


@router.get("/promotions", response_model=list[PromotionOfferRead], dependencies=[Depends(require_admin)])
async def list_promotions(
    hotel_id: str | None = Query(default=None),
    contract_id: str | None = Query(default=None),
    operator_code: str | None = Query(default=None),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[dict]:
    service = HospitalityService(db)
    return await service.list_promotions(
        hotel_id=hotel_id,
        contract_id=contract_id,
        operator_code=operator_code,
    )


@router.post("/ai/pricing/extract", response_model=AIPricingExtractionRead)
async def ai_extract_pricing(
    file: UploadFile = File(...),
    hotel_id: str | None = Form(default=None),
    hotel_code: str | None = Form(default=None),
    operator_code: str = Form(...),
    season_label: str | None = Form(default=None),
    model: str | None = Form(default=None),
    schema_json: str | None = Form(default=None),
    mapping_instructions: str | None = Form(default=None),
    admin_user: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = HospitalityService(db)

    schema_override: dict | None = None
    if schema_json and schema_json.strip():
        try:
            parsed = json.loads(schema_json)
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid schema_json payload. Provide a valid JSON object.",
            ) from exc
        if not isinstance(parsed, dict):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="schema_json must be a JSON object.",
            )
        schema_override = parsed

    return await service.ai_extract_pricing_contract(
        upload_file=file,
        hotel_id=hotel_id,
        hotel_code=hotel_code,
        operator_code=operator_code,
        season_label=season_label,
        model=model,
        schema_override=schema_override,
        mapping_instructions=mapping_instructions,
        created_by_user_id=admin_user["id"],
    )


@router.post("/ai/pricing/recommend-content", response_model=AIPricingContentRecommendationRead)
@router.post("/ai/pricing/recommend-model", response_model=AIPricingContentRecommendationRead)
async def ai_recommend_pricing_content(
    file: UploadFile = File(...),
    hotel_id: str | None = Form(default=None),
    hotel_code: str | None = Form(default=None),
    operator_code: str = Form(...),
    season_label: str | None = Form(default=None),
    _: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = HospitalityService(db)
    return await service.ai_recommend_pricing_content(
        upload_file=file,
        hotel_id=hotel_id,
        hotel_code=hotel_code,
        operator_code=operator_code,
        season_label=season_label,
    )


@router.post("/ai/pricing/persist", response_model=AIPricingPersistResponse)
async def ai_persist_pricing(
    payload: AIPricingPersistRequest,
    admin_user: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = HospitalityService(db)
    return await service.persist_ai_extraction(payload=payload, persisted_by_user_id=admin_user["id"])


@router.post("/rules/generate", response_model=list[PricingRuleRead])
async def generate_rules(
    payload: RuleGenerationRequest,
    _: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[dict]:
    service = HospitalityService(db)
    return await service.generate_rules(payload)


@router.get("/rules", response_model=list[PricingRuleRead], dependencies=[Depends(require_admin)])
async def list_rules(
    contract_id: str | None = Query(default=None),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[dict]:
    service = HospitalityService(db)
    return await service.list_rules(contract_id=contract_id)


@router.post("/sync", response_model=SyncRunRead)
async def sync_configuration(
    payload: SyncRequest,
    admin_user: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = HospitalityService(db)
    return await service.sync_configuration(payload=payload, created_by_user_id=admin_user["id"])


@router.get("/sync-runs", response_model=list[SyncRunRead], dependencies=[Depends(require_admin)])
async def list_sync_runs(
    contract_id: str | None = Query(default=None),
    hotel_id: str | None = Query(default=None),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[dict]:
    service = HospitalityService(db)
    return await service.list_sync_runs(contract_id=contract_id, hotel_id=hotel_id)


@router.post("/validate/batch", response_model=ValidationRunRead)
async def validate_batch(
    payload: ValidationBatchRequest,
    admin_user: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = HospitalityService(db)
    return await service.validate_batch(payload=payload, created_by_user_id=admin_user["id"])


@router.post("/reconciliations/imports", response_model=ReconciliationImportRead)
async def persist_reconciliation_import(
    payload: ReconciliationImportPersistRequest,
    admin_user: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = HospitalityService(db)
    return await service.persist_reconciliation_import(payload=payload, created_by_user_id=admin_user["id"])


@router.post("/reconciliations/v2/imports", response_model=ReconciliationImportRead)
async def persist_reconciliation_import_v2(
    payload: ReconciliationImportPersistRequest,
    admin_user: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = HospitalityService(db)
    return await service.persist_reconciliation_import_v2(payload=payload, created_by_user_id=admin_user["id"])


@router.get("/reconciliations/imports", response_model=list[ReconciliationImportRead], dependencies=[Depends(require_admin)])
async def list_reconciliation_imports(
    contract_id: str | None = Query(default=None),
    hotel_id: str | None = Query(default=None),
    source_system: str | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=2000),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[dict]:
    service = HospitalityService(db)
    return await service.list_reconciliation_imports(
        contract_id=contract_id,
        hotel_id=hotel_id,
        source_system=source_system,
        limit=limit,
    )


@router.get("/reconciliations/reservations", response_model=ReconciliationReservationListRead, dependencies=[Depends(require_admin)])
async def list_reconciliation_reservations(
    q: str | None = Query(default=None),
    contract_id: str | None = Query(default=None),
    hotel_id: str | None = Query(default=None),
    import_id: str | None = Query(default=None),
    room_type: str | None = Query(default=None),
    board_type: str | None = Query(default=None),
    source_system: str | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    sort_by: Literal["stay_date", "actual_price", "room_type", "reservation_id", "created_at"] = Query(default="stay_date"),
    sort_order: Literal["asc", "desc"] = Query(default="desc"),
    limit: int = Query(default=500, ge=1, le=1000),
    offset: int = Query(default=0, ge=0, le=20000),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = HospitalityService(db)
    return await service.list_reconciliation_reservations(
        contract_id=contract_id,
        hotel_id=hotel_id,
        import_id=import_id,
        room_type=room_type,
        board_type=board_type,
        start_date=start_date,
        end_date=end_date,
        source_system=source_system,
        search_text=q,
        sort_by=sort_by,
        sort_order=sort_order,
        limit=limit,
        offset=offset,
    )


@router.delete(
    "/reconciliations/reservations/{reservation_row_id}",
    response_model=ReconciliationReservationDeleteRead,
)
async def delete_reconciliation_reservation(
    reservation_row_id: str,
    _: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = HospitalityService(db)
    return await service.delete_reconciliation_reservation(reservation_row_id=reservation_row_id)


@router.delete(
    "/reconciliations/reservations",
    response_model=ReconciliationReservationBulkDeleteRead,
)
async def delete_reconciliation_reservations(
    contract_id: str = Query(...),
    hotel_id: str | None = Query(default=None),
    import_id: str | None = Query(default=None),
    room_type: str | None = Query(default=None),
    board_type: str | None = Query(default=None),
    source_system: str | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    q: str | None = Query(default=None),
    _: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = HospitalityService(db)
    return await service.delete_reconciliation_reservations(
        contract_id=contract_id,
        hotel_id=hotel_id,
        import_id=import_id,
        room_type=room_type,
        board_type=board_type,
        source_system=source_system,
        start_date=start_date,
        end_date=end_date,
        search_text=q,
    )


@router.post("/validate/reconciliation/preview", response_model=ReconciliationExtractionRead)
async def preview_reconciliation_file(
    file: UploadFile = File(...),
    contract_id: str = Form(...),
    sheet_name: str | None = Form(default=None),
    sample_limit: int = Form(default=150),
    _: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = HospitalityService(db)
    return await service.preview_reconciliation_upload(
        upload_file=file,
        contract_id=contract_id,
        sheet_name=sheet_name,
        sample_limit=sample_limit,
    )


@router.post("/validate/reconciliation/workbook-preview", response_model=ReconciliationWorkbookPreviewRead)
async def preview_reconciliation_workbook(
    file: UploadFile = File(...),
    contract_id: str = Form(...),
    sample_rows: int = Form(default=6),
    _: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = HospitalityService(db)
    return await service.preview_reconciliation_workbook(
        upload_file=file,
        contract_id=contract_id,
        sample_rows=sample_rows,
    )


@router.post("/validate/reconciliation/ai-map", response_model=ReconciliationAIMappingRead)
async def ai_map_reconciliation_file(
    file: UploadFile = File(...),
    contract_id: str = Form(...),
    sheet_name: str = Form(...),
    source_system: str | None = Form(default=None),
    reservation_id_column: str | None = Form(default=None),
    sample_limit: int = Form(default=250),
    model: str | None = Form(default=None),
    mapping_instructions: str | None = Form(default=None),
    _: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = HospitalityService(db)
    return await service.ai_map_reconciliation_upload(
        upload_file=file,
        contract_id=contract_id,
        sheet_name=sheet_name,
        source_system=source_system,
        reservation_id_column=reservation_id_column,
        sample_limit=sample_limit,
        model=model,
        mapping_instructions=mapping_instructions,
    )


@router.post("/validate/reconciliation", response_model=ValidationRunRead)
async def validate_reconciliation_file(
    file: UploadFile = File(...),
    contract_id: str = Form(...),
    sheet_name: str | None = Form(default=None),
    source_system: str | None = Form(default=None),
    reservation_id_column: str | None = Form(default=None),
    use_ai_mapping: bool = Form(default=False),
    model: str | None = Form(default=None),
    mapping_instructions: str | None = Form(default=None),
    run_label: str | None = Form(default=None),
    tolerance_amount: float = Form(default=1.0),
    tolerance_percent: float = Form(default=1.0),
    admin_user: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = HospitalityService(db)
    return await service.validate_reconciliation_upload(
        upload_file=file,
        contract_id=contract_id,
        sheet_name=sheet_name,
        source_system=source_system,
        reservation_id_column=reservation_id_column,
        use_ai_mapping=use_ai_mapping,
        model=model,
        mapping_instructions=mapping_instructions,
        run_label=run_label,
        tolerance_amount=tolerance_amount,
        tolerance_percent=tolerance_percent,
        created_by_user_id=admin_user["id"],
    )


@router.get("/alerts", response_model=list[AlertRead], dependencies=[Depends(require_admin)])
async def list_alerts(
    status_value: Literal["open", "resolved"] | None = Query(default=None, alias="status"),
    hotel_id: str | None = Query(default=None),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[dict]:
    service = HospitalityService(db)
    return await service.list_alerts(status_value=status_value, hotel_id=hotel_id)


@router.patch("/alerts/{alert_id}/resolve", response_model=AlertRead)
async def resolve_alert(
    alert_id: str,
    payload: AlertResolveRequest,
    admin_user: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = HospitalityService(db)
    return await service.resolve_alert(alert_id=alert_id, payload=payload, resolved_by_user_id=admin_user["id"])


@router.get("/reports/discrepancies", response_model=list[DiscrepancyReportRow], dependencies=[Depends(require_admin)])
async def discrepancy_report(
    hotel_id: str | None = Query(default=None),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[dict]:
    service = HospitalityService(db)
    return await service.discrepancy_report(hotel_id=hotel_id)


@router.get("/reports/contracts", response_model=list[ContractPerformanceReportRow], dependencies=[Depends(require_admin)])
async def contracts_report(
    hotel_id: str | None = Query(default=None),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[dict]:
    service = HospitalityService(db)
    return await service.contract_performance_report(hotel_id=hotel_id)


@router.get("/reports/operators", response_model=list[OperatorReportRow], dependencies=[Depends(require_admin)])
async def operators_report(
    hotel_id: str | None = Query(default=None),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[dict]:
    service = HospitalityService(db)
    return await service.operator_report(hotel_id=hotel_id)
