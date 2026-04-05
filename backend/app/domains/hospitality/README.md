# Hospitality Domain

## Purpose

Core hospitality workflow domain:

- contract ingestion and extraction from PDF/XLS/XLSM/TXT/CSV/DOCX
- promotion ingestion (manual + AI email-style)
- AI pricing extraction and persistence
- rule generation and sync simulation
- reconciliation workbook analysis, AI mapping, import, and validation
- alerts and reporting

## Main Endpoints

- `GET /api/v1/hospitality/overview`
- `GET /api/v1/hospitality/upload-limits`
- `PATCH /api/v1/hospitality/upload-limits`
- `GET /api/v1/hospitality/contract-templates`
- `POST /api/v1/hospitality/contract-templates`
- `POST /api/v1/hospitality/contract-templates/generate`
- `GET /api/v1/hospitality/contract-templates/{template_id}`
- `PATCH /api/v1/hospitality/contract-templates/{template_id}`
- `POST /api/v1/hospitality/contracts/ingest`
- `POST /api/v1/hospitality/contracts/ingest-bundle`
- `POST /api/v1/hospitality/contracts/ingest-from-paths`
- `GET /api/v1/hospitality/contracts`
- `GET /api/v1/hospitality/contracts/{contract_id}`
- `GET /api/v1/hospitality/contracts/{contract_id}/file`
- `GET /api/v1/hospitality/contracts/{contract_id}/price-matrix`
- `POST /api/v1/hospitality/promotions/ingest`
- `POST /api/v1/hospitality/promotions/ai-ingest`
- `POST /api/v1/hospitality/promotions/ingest-from-paths`
- `GET /api/v1/hospitality/promotions`
- `POST /api/v1/hospitality/ai/pricing/extract`
- `POST /api/v1/hospitality/ai/pricing/recommend-content`
- `POST /api/v1/hospitality/ai/pricing/recommend-model`
- `POST /api/v1/hospitality/ai/pricing/persist`
- `POST /api/v1/hospitality/rules/generate`
- `GET /api/v1/hospitality/rules`
- `POST /api/v1/hospitality/sync`
- `GET /api/v1/hospitality/sync-runs`
- `POST /api/v1/hospitality/validate/batch`
- `POST /api/v1/hospitality/validate/reconciliation/preview`
- `POST /api/v1/hospitality/validate/reconciliation/workbook-preview`
- `POST /api/v1/hospitality/validate/reconciliation/ai-map`
- `POST /api/v1/hospitality/reconciliations/imports`
- `GET /api/v1/hospitality/reconciliations/reservations`
- `DELETE /api/v1/hospitality/reconciliations/reservations/{reservation_row_id}`
- `DELETE /api/v1/hospitality/reconciliations/reservations`
- `POST /api/v1/hospitality/validate/reconciliation`
- `GET /api/v1/hospitality/alerts`
- `PATCH /api/v1/hospitality/alerts/{alert_id}/resolve`
- `GET /api/v1/hospitality/reports/discrepancies`
- `GET /api/v1/hospitality/reports/contracts`
- `GET /api/v1/hospitality/reports/operators`

## Ingestion Guardrails

- Server-enforced upload limits are admin-configurable (1-100 MB per category) via upload-limits endpoints.
- Default limits:
  - contract: 10 MB
  - pricing AI: 10 MB
  - promotion: 8 MB
  - reconciliation: 20 MB
- Contract bundle upload: max 20 files per request.
- File extension allowlists are enforced per ingestion type.
- Path-based ingestion is restricted outside local environments and must remain under `SEED_INGESTION_ROOT`.

## OpenAI Error Visibility

- AI errors always return a sanitized reference ID for troubleshooting.
- In `local/dev/development/test`, sanitized provider detail is appended in response `detail` for faster debugging.
- In non-local environments, provider internals remain server-side only.

## Notes

- Sync is implemented as a simulated adapter payload and run log.
- Validation logic is rule-driven and highlights likely PMS/configuration mismatches.
- Reconciliation rows now preserve canonical booking fields (`booking_code`, `booking_date`, `room_type`, `board_type`, `actual_price`, `check_in_date`, `check_out_date`) for audit traceability.
- Contract templates are operator/hotel scoped and can be generated from uploads via AI recommendation output.
- Data is persisted under `hospitality_*` Mongo collections.
