# Frontend Post-Hardening Notes

## Summary
The frontend hardening pass is implemented with high-confidence, low-regression-risk changes focused on pre-deployment blockers plus request lifecycle and testability improvements.

## What Was Implemented

### API, Env, and Build Safety
- `frontend/src/api/client.ts`
  - strict non-dev API base validation
  - localhost guard in production mode
  - global axios timeout baseline
  - cancellation detection helper (`isRequestCancelled`)
- `frontend/Dockerfile`
  - requires explicit `VITE_API_BASE_URL`
  - blocks localhost targets for production image build
- `frontend/vite.config.ts` and `frontend/vite.config.js`
  - explicit `envPrefix: "VITE_"`
  - explicit `build.sourcemap = false`

### Token/Data Exposure Hardening
- `frontend/src/lib/url-security.ts`
  - sensitive token query param scrubbing
- `frontend/src/pages/login-page.tsx`
- `frontend/src/pages/password-reset-page.tsx`
  - token params scrubbed on load
  - reset token removed from visible UI
- `frontend/src/lib/notify.tsx`
  - backend-derived error text sanitization before UI display

### File Preview Hardening
- `frontend/src/lib/blob-safety.ts`
  - safe MIME policy for open/download/block behavior
- `frontend/src/pages/contracts-page.tsx`
- `frontend/src/pages/contract-detail-page.tsx`
  - replaced direct blob open with MIME-safe handling

### Request Cancellation and Stale-Response Safety
- `frontend/src/features/hospitality/use-contracts-explorer.ts`
- `frontend/src/features/hospitality/use-price-list-calendar.ts`
- `frontend/src/features/hospitality/use-reconciliations.ts`
- `frontend/src/features/users/use-users-management.ts`
- `frontend/src/features/invitations/use-invitations-management.ts`
- `frontend/src/pages/contract-detail-page.tsx`
  - AbortController cancellation for inflight requests
  - canceled request suppression (no noisy user errors)
  - unmount cleanup to avoid stale state updates

### Runtime Fallback and Header Baseline
- `frontend/src/main.tsx`
  - route/root error fallbacks
- `frontend/src/index.css`
  - toaster container style moved from inline to CSS class
- `frontend/nginx.conf`
  - added `Permissions-Policy`, `Cross-Origin-Opener-Policy`, and CSP report-only baseline

### CI and Testing
- `.github/workflows/security-gates.yml`
  - frontend gate now runs build and tests
- `frontend/vitest.config.ts`
- `frontend/tests/url-security.test.ts`
- `frontend/tests/blob-safety.test.ts`
- `frontend/package.json`, `frontend/package-lock.json`
  - added Vitest scripts and dependencies

## Validation Executed
- `npm run test --prefix frontend` passed (`2` files, `5` tests)
- `npm run build --prefix frontend` passed

## Behavior Changes to Expect
- invalid/missing production API base now fails early instead of silently falling back
- reset token no longer appears in UI
- non-safe file MIME may download or be blocked instead of opening inline
- canceled requests are quietly handled (fewer noisy transient errors)
- some backend error text may be generalized for user safety

## Backend/Runtime-Dependent Items Still Pending
- CSRF contract for cookie-auth mutating requests
- backend token replay/TTL enforcement
- backend MIME/content-disposition enforcement for file endpoints
- edge/CDN enforced CSP (non-report mode) + HSTS
- GitHub Actions immutable SHA pinning + branch protection enforcement

## Immediate Next Checks
1. Staging test for auth/reset/invitation flows with URL token scrubbing.
2. File endpoint staging tests for safe/unsafe MIME responses.
3. Deployed-edge header validation (CSP reports, HSTS, policy coverage).
4. Final backend CSRF and token replay controls before release.
