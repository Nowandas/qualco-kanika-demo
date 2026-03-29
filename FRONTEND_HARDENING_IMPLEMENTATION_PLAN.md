# Frontend Hardening Implementation Plan

## Scope and Intent
This plan records implemented high-confidence frontend hardening work and separates remaining backend/runtime-dependent release blockers.

## 1) Implemented in This Pass

### FESEC-001 (pre-deploy blocker): API base URL and env hardening
- status: implemented
- files:
  - `frontend/src/api/client.ts`
  - `frontend/Dockerfile`
  - `.github/workflows/security-gates.yml`
- changes:
  - strict non-dev API base validation
  - localhost guard for production API targets
  - axios timeout baseline (`15_000ms`)
  - CI frontend build gate with explicit API base env
- rollback risk: low
- isolated PR safety: high

### FESEC-003 (pre-deploy blocker): token exposure reduction
- status: frontend-side mitigations implemented
- files:
  - `frontend/src/lib/url-security.ts`
  - `frontend/src/pages/login-page.tsx`
  - `frontend/src/pages/password-reset-page.tsx`
- changes:
  - sensitive auth query params scrubbed from URL
  - reset token field removed from visible UI
- rollback risk: low
- isolated PR safety: high

### FESEC-004 (pre-deploy blocker): safe blob/file handling
- status: frontend-side mitigations implemented
- files:
  - `frontend/src/lib/blob-safety.ts`
  - `frontend/src/pages/contracts-page.tsx`
  - `frontend/src/pages/contract-detail-page.tsx`
- changes:
  - safe inline MIME allowlist
  - unknown MIME => forced download
  - active MIME (HTML/JS/SVG) => blocked
- rollback risk: low
- isolated PR safety: high

### FESEC-005: static browser-hardening header baseline
- status: implemented at frontend static layer
- files:
  - `frontend/nginx.conf`
- changes:
  - `Permissions-Policy`, `Cross-Origin-Opener-Policy`
  - baseline `Content-Security-Policy-Report-Only`
- rollback risk: low
- isolated PR safety: high

### FESEC-006/FESEC-006-B: request lifecycle hardening
- status: implemented
- files:
  - `frontend/src/features/hospitality/use-contracts-explorer.ts`
  - `frontend/src/features/hospitality/use-price-list-calendar.ts`
  - `frontend/src/features/hospitality/use-reconciliations.ts`
  - `frontend/src/features/users/use-users-management.ts`
  - `frontend/src/features/invitations/use-invitations-management.ts`
  - `frontend/src/pages/contract-detail-page.tsx`
  - `frontend/src/api/client.ts`
- changes:
  - AbortController cancellation in high-traffic async loaders
  - stale request guard + canceled-request suppression
  - unmount cleanup for inflight requests
- rollback risk: low-medium
- isolated PR safety: medium-high

### FESEC-007/FESEC-008/FESEC-012: runtime/data exposure improvements
- status: implemented
- files:
  - `frontend/src/lib/notify.tsx`
  - `frontend/src/main.tsx`
  - `frontend/src/index.css`
- changes:
  - sanitized backend-derived UI error messages
  - route/root error fallbacks
  - reduced inline style usage for toaster container
- rollback risk: low-medium
- isolated PR safety: medium-high

### Vite and test safety upgrades
- status: implemented
- files:
  - `frontend/vite.config.ts`
  - `frontend/vite.config.js`
  - `frontend/vitest.config.ts`
  - `frontend/tests/url-security.test.ts`
  - `frontend/tests/blob-safety.test.ts`
  - `frontend/package.json`
  - `.github/workflows/security-gates.yml`
- changes:
  - explicit `envPrefix` and `sourcemap=false`
  - introduced Vitest (`test`, `test:watch` scripts)
  - added targeted tests for token scrubbing and MIME handling
  - CI build gate now also runs frontend tests
- rollback risk: low
- isolated PR safety: high

## 2) Remaining Pre-Deployment Work (Backend/Runtime Dependent)

### FESEC-002: CSRF contract for cookie-auth
- status: pending (backend-dependent)
- required next step: align frontend token/header behavior with backend CSRF verification rules.

### FESEC-003 backend completion
- status: pending
- required next step: enforce single-use + TTL guarantees for reset/invitation token replay protection.

### FESEC-004 backend completion
- status: pending
- required next step: enforce backend file MIME/content-disposition controls for served contract files.

### FESEC-005 edge/CDN completion
- status: pending
- required next step: enforce CSP (non-report mode) and HSTS at TLS terminator/CDN.

### FESEC-011-B supply chain completion
- status: pending
- required next step: pin all GitHub actions to immutable commit SHAs.

## 3) Release Order
1. Merge frontend hardening set and verify CI build+test gate is required.
2. Implement CSRF and token replay protections backend-side.
3. Validate backend file-serving controls for contract file endpoints.
4. Enforce edge/CDN CSP + HSTS.
5. Pin workflow actions by SHA and verify branch protection enforcement.
6. Run staging smoke tests for auth flows, token-link handling, and file preview behaviors.

## 4) Validation Executed
- `npm run test --prefix frontend` (passed)
- `npm run build --prefix frontend` (passed)
