# kanika-demo

Hospitality contract and pricing operations demo with MongoDB persistence and OpenAI-assisted extraction workflows.

## What the Demo Covers

- Authentication and admin access control.
- User and invitation lifecycle management.
- Hotel master data management and hotel-scoped views.
- Contract ingestion from file uploads and allowlisted seeded paths.
- AI contract content recommendation (recommended data, schema, mapping instructions).
- AI contract template creator (operator/hotel scoped reusable extraction templates).
- AI extraction and persistence of contract pricing structures.
- Contract detail matrix by room/board/period with promotion toggle views.
- Promotion ingestion (including AI email-style ingestion) applied to one or more contracts.
- Reconciliation workbook wizard, persisted reservation rows, canonical booking/check-in/out fields, and expected-vs-actual validation.
- Header quick actions dropdown for hotel/contract selection and contract-scoped promo AI upload.
- Admin-managed upload limits (Settings modal in app header).
- Contract source file retrieval from contracts list and contract detail.

## Main UI Navigation

- Contract Management: Contracts, Pricing AI, Reconciliations.
- Users: Users, Invitations.
- Reference: Demo Documentation (Overview), Business, Frontend, Backend.

Documentation hub:
- `docs/README_INDEX.md`

## Quick Start

1. Copy env file and set required secrets:

```bash
cp .env.example .env
```

Required in `.env` for local Docker runs:

- `MONGO_ROOT_PASSWORD`
- `MONGO_APP_PASSWORD`
- `OPENAI_API_KEY` (required for AI endpoints)

2. Start local development profile (hot reload + Mongo exposed on host):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

3. Open:

- Frontend: `http://localhost:5173`
- API docs: `http://localhost:8000/docs`
- Health: `http://localhost:8000/health`

## Production-Like Compose Profile

Use the base compose file when you want prod images/entrypoints:

```bash
VITE_API_BASE_URL=https://<your-frontend-api-domain>/api/v1 docker compose up -d --build
```

Important:
- Frontend production image build fails fast if `VITE_API_BASE_URL` is missing.
- Frontend production image build also fails if `VITE_API_BASE_URL` points to localhost.

## First Login

- On startup, backend ensures a master admin account exists.
- Credentials come from `.env`:
  - `MASTER_ADMIN_EMAIL`
  - `MASTER_ADMIN_PASSWORD`
- Sign in from `http://localhost:5173` using those values.

## Environment Variables

Core settings are documented in `.env.example`.

Key groups:
- App/runtime: `APP_*`, `TRUST_PROXY_HEADERS`
- Auth/session: `JWT_*`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `AUTH_COOKIE_*`, `CSRF_*`
- Auth abuse controls: `AUTH_LOGIN_*`, `AUTH_SENSITIVE_*`
- CORS: `CORS_ALLOW_*`, `CORS_EXPOSE_HEADERS`
- Mongo: `MONGO_ROOT_*`, `MONGO_APP_*`, `MONGO_DB_NAME`, `MONGO_URI`
- Frontend build: `VITE_API_BASE_URL`, `VITE_CSRF_COOKIE_NAME`, `VITE_CSRF_HEADER_NAME`
- AI: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_PRICING_MODEL`
- Seed ingestion: `SEED_PATH_INGESTION_ENABLED`, `SEED_INGESTION_ROOT`
- Bootstrap admin: `MASTER_ADMIN_*`

## Security Notes

- Cookie-based auth is primary; bearer token auth remains for compatibility.
- Mutating cookie-auth requests require CSRF header matching CSRF cookie.
- Auth-sensitive endpoints are rate-limited; failed logins trigger temporary lockout.
- Path-based seed ingestion is restricted in non-local environments and bound to an allowlisted root.
- Upload limits are server-enforced and admin-configurable (`GET/PATCH /api/v1/hospitality/upload-limits`).
- Contract file delivery enforces safe content headers and inline/attachment behavior by type.
- For upstream OpenAI failures, API returns a reference ID; sanitized provider details are appended only in local/dev/test environments.

## Notable Hospitality Endpoints

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
- `GET /api/v1/hospitality/promotions`
- `POST /api/v1/hospitality/ai/pricing/recommend-content`
- `POST /api/v1/hospitality/ai/pricing/extract`
- `POST /api/v1/hospitality/ai/pricing/persist`
- `POST /api/v1/hospitality/validate/reconciliation/workbook-preview`
- `POST /api/v1/hospitality/validate/reconciliation/ai-map`
- `POST /api/v1/hospitality/reconciliations/imports`
- `GET /api/v1/hospitality/reconciliations/reservations`
- `POST /api/v1/hospitality/validate/reconciliation`

## Project Structure

- `backend/app/main.py`
- `backend/app/core/*`
- `backend/app/domains/auth/*`
- `backend/app/domains/users/*`
- `backend/app/domains/invitations/*`
- `backend/app/domains/password_resets/*`
- `backend/app/domains/hotels/*`
- `backend/app/domains/hospitality/*`
- `frontend/src/components/*`
- `frontend/src/features/hospitality/*`
- `frontend/src/features/users/*`
- `frontend/src/features/invitations/*`
- `frontend/src/pages/*`
