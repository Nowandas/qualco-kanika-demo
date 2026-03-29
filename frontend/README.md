# Frontend

React + Vite admin UI for `kanika-demo`.

## Scope

- Login and invitation acceptance.
- Password reset token page.
- Users management (role/status/reset-link actions).
- Invitations management (create/list/copy token and link).
- Hotel-scoped hospitality operations workspace:
  - Contract and promotion ingestion.
  - AI pricing extraction and persistence.
  - Price-list calendar matrix.
  - Reconciliation wizard (workbook preview, AI mapping, import, validation).
- Admin upload-limit controls:
  - Settings button in header opens modal.
  - Updates backend-enforced limits for contract/promotion/reconciliation/pricing AI uploads.

## Security-Relevant Frontend Behavior

- API base URL is resolved from `VITE_API_BASE_URL` and fails non-dev builds when missing/invalid.
- Non-dev builds reject localhost API origins.
- Axios client uses `withCredentials: true`, 15s timeout, and CSRF header injection for mutating requests.
- Pricing AI upload is disabled until a specific hotel is selected from sidebar scope.
- User-facing API errors are sanitized before toast display.

## Architecture Notes

- `src/components/app/page-shell.tsx` shared page/section layout.
- `src/components/layout/app-layout.tsx` header/sidebar shell + admin settings entrypoint.
- `src/components/layout/upload-limits-settings-modal.tsx` upload limits management modal.
- `src/components/ui/*` shared controls (`input`, `select`, `textarea`, `table`, etc.).
- `src/features/users/use-users-management.ts` users workflow logic.
- `src/features/invitations/use-invitations-management.ts` invitations workflow logic.
- `src/features/hospitality/use-pricing-ai-ingestion.ts` AI pricing extraction workflow logic.
- `src/features/hospitality/use-contracts-explorer.ts` contracts search/filter/sort workflow logic.
- `src/features/hospitality/use-price-list-calendar.ts` price matrix filtering + calendar shaping logic.
- `src/features/hospitality/use-reconciliations.ts` reconciliation upload/import/validation workflow logic.
- `src/lib/notify.tsx` toast notification + API error sanitization.
- `src/api/client.ts` axios setup, timeout, CSRF injection, base URL guardrails.

## Run

From repository root:

Local development frontend (with backend/mongo):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build frontend backend mongo
```

Production-like frontend container build:

```bash
VITE_API_BASE_URL=https://<your-api-domain>/api/v1 docker compose up -d --build frontend
```

## Build

```bash
npm run build --prefix frontend
```
