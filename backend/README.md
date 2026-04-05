# Backend

FastAPI backend for `kanika-demo`.

## Active Domains

- `auth`
- `users`
- `invitations`
- `password_resets`
- `hotels`
- `hospitality`

## Run

From repository root:

Local development (recommended):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build backend mongo
```

Production-like backend container:

```bash
docker compose up -d --build backend mongo
```

## Docs

- Swagger: `http://localhost:8000/docs`
- Health: `http://localhost:8000/health`

## Startup Bootstrapping

On startup, backend ensures:

- Mongo indexes for active domains.
- Master admin account exists (`MASTER_ADMIN_*`).

## Auth and Security Model

- Cookie-based auth is primary (`AUTH_COOKIE_*` settings).
- CSRF protection is enforced for mutating cookie-auth requests (`CSRF_COOKIE_NAME`, `CSRF_HEADER_NAME`).
- Bearer token auth is still accepted for compatibility.
- Auth-sensitive endpoints are rate-limited.
- Failed logins trigger temporary lockout (`AUTH_LOGIN_MAX_FAILED_ATTEMPTS`, `AUTH_LOGIN_LOCKOUT_MINUTES`).

## Main Endpoints

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/accept-invitation`
- `GET /api/v1/auth/password-reset/{token}`
- `POST /api/v1/auth/password-reset`
- `GET /api/v1/users` (admin)
- `PATCH /api/v1/users/{user_id}` (admin)
- `POST /api/v1/users/{user_id}/password-reset-link` (admin)
- `PATCH /api/v1/users/me/profile` (authenticated)
- `PATCH /api/v1/users/me/avatar` (authenticated)
- `PATCH /api/v1/users/me/password` (authenticated)
- `GET /api/v1/invitations` (admin)
- `POST /api/v1/invitations` (admin)
- `GET /api/v1/hotels` (admin)
- `POST /api/v1/hotels` (admin)
- `PATCH /api/v1/hotels/{hotel_id}` (admin)
- `GET /api/v1/hospitality/upload-limits` (admin)
- `PATCH /api/v1/hospitality/upload-limits` (admin)
- `GET /api/v1/hospitality/contract-templates` (admin)
- `POST /api/v1/hospitality/contract-templates` (admin)
- `POST /api/v1/hospitality/contract-templates/generate` (admin)
- `GET /api/v1/hospitality/contract-templates/{template_id}` (admin)
- `PATCH /api/v1/hospitality/contract-templates/{template_id}` (admin)
- `POST /api/v1/hospitality/contracts/ingest`
- `POST /api/v1/hospitality/contracts/ingest-bundle`
- `POST /api/v1/hospitality/contracts/ingest-from-paths`
- `GET /api/v1/hospitality/contracts`
- `GET /api/v1/hospitality/contracts/{contract_id}/file`
- `POST /api/v1/hospitality/promotions/ingest`
- `POST /api/v1/hospitality/promotions/ai-ingest`
- `POST /api/v1/hospitality/ai/pricing/recommend-content`
- `POST /api/v1/hospitality/ai/pricing/extract`
- `POST /api/v1/hospitality/ai/pricing/persist`
- `POST /api/v1/hospitality/validate/reconciliation/workbook-preview`
- `POST /api/v1/hospitality/validate/reconciliation/ai-map`
- `POST /api/v1/hospitality/reconciliations/imports`
- `GET /api/v1/hospitality/reconciliations/reservations`
- `POST /api/v1/hospitality/validate/reconciliation`

## OpenAI Settings

- `OPENAI_API_KEY` (required for AI extraction endpoints)
- `OPENAI_BASE_URL` (optional override)
- `OPENAI_PRICING_MODEL` (default extraction model)

For upstream AI failures, API error payloads always include a reference ID. In local/dev/test only, sanitized provider response details are also appended to help debugging.

## Reconciliation Canonical Dataset

Reconciliation import/validation supports canonical booking fields used for auditing:

- `booking_code`
- `booking_date`
- `board_type`
- `actual_price` (cost)
- `room_type`
- `check_in_date`
- `check_out_date`
