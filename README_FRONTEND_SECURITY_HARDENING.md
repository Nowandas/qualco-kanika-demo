# Frontend Security Audit & Hardening Plan

## 1. Executive Summary
- The Vite + React frontend now has stronger production guardrails than the initial audit baseline: strict API base URL checks, cookie+CSRF client behavior, sanitized user-facing errors, upload-limit controls, and hardened static-server headers.
- Remaining work is mostly deployment/runtime verification (edge headers/TLS, backend CSRF/session behavior across real domains, and final pre-release environment validation).
- Production readiness status: **Conditionally ready after critical fixes**

## 2. Top Frontend Risks
- FESEC-001: Production deploy can fail or misroute if `VITE_API_BASE_URL` is not explicitly provided per environment.
- FESEC-002: Cookie-auth + CSRF flow still requires end-to-end runtime verification with deployed frontend/backend domains.
- FESEC-003: Token-in-URL flows (invitation/password reset) still require strict referrer/analytics handling validation.
- FESEC-004: Frontend safety depends on backend file serving policy for download/open flows.
- FESEC-005: Edge/CDN headers may differ from container nginx configuration and must be verified.

## 3. Critical Findings
No confirmed critical frontend vulnerability remains from repository evidence alone.

High-priority pre-deploy items are operational validation tasks:
- correct production `VITE_API_BASE_URL`
- verified cross-origin cookie/CSRF behavior
- verified edge headers/TLS policy

## 4. Hardening Recommendations

### Vite configuration
- Keep strict `VITE_API_BASE_URL` validation (missing/localhost prevention in non-dev).
- Keep single-source Vite config and controlled env usage.
- Keep production sourcemap policy explicit.

### React application security
- Keep upload gate behavior requiring selected hotel context before pricing contract upload.
- Keep reconciliation wizard modal containment + internal scroll behavior to avoid content overflow.
- Keep safe error-to-toast sanitization to avoid leaking backend internals.

### auth/session handling
- Maintain cookie auth as primary frontend flow.
- Maintain CSRF header injection for mutating calls.
- Keep logout/session cleanup and unauthorized-state handling deterministic.

### API client behavior
- Keep request timeout (`15s`) and cancellation checks for long-running pages.
- Continue using centralized axios instance/interceptors.
- Keep sanitized fallback messages for UI-safe error surfacing.

### dependency hygiene
- Continue recurring `npm audit` + Dependabot updates.
- Keep lockfile-driven installs (`npm ci`) for deterministic builds.

### build and deployment exposure
- Keep hardened nginx headers in container image.
- Validate that upstream ingress/CDN does not weaken header policy.
- Keep environment-specific build contracts documented and enforced.

### observability and production safety
- Track frontend auth/API failure telemetry.
- Maintain release smoke tests for login/session/upload/reconciliation flows.

## 5. Quick Wins
- Set and validate production `VITE_API_BASE_URL` in CI/CD before build.
- Run browser-level CSRF/cookie smoke tests from deployed frontend domain.
- Validate that token URLs are not leaked through referrer headers/analytics.
- Confirm edge response headers match or exceed nginx defaults.

## 6. Pre-Deployment Checklist
- [ ] `VITE_API_BASE_URL` set to production API origin (not localhost).
- [ ] Frontend build passes with production config.
- [ ] Cookie-auth + CSRF flow validated from real frontend domain.
- [ ] Upload-limit settings modal and upload rejection UX validated.
- [ ] Pricing AI upload gate (hotel selection required) validated.
- [ ] Reconciliation wizard modal verified on large data payloads.
- [ ] Edge/CDN headers validated (CSP, frame, nosniff, referrer, permissions, HSTS).

## 7. Post-Deployment Validation
- [ ] Validate no frontend calls target unexpected origins.
- [ ] Validate session stability and logout behavior across tabs/reloads.
- [ ] Validate AI upstream errors show safe reference diagnostics only in expected environments.
- [ ] Validate file-open flows behave safely for allowed content types.
- [ ] Monitor frontend API/network timeout/error trends.

## 8. Files Reviewed
- `frontend/vite.config.ts`
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/Dockerfile`
- `frontend/nginx.conf`
- `frontend/src/api/client.ts`
- `frontend/src/lib/notify.tsx`
- `frontend/src/components/layout/app-layout.tsx`
- `frontend/src/components/layout/upload-limits-settings-modal.tsx`
- `frontend/src/pages/pricing-ingestion-page.tsx`
- `frontend/src/pages/reconciliations-page.tsx`
- `frontend/src/pages/login-page.tsx`
- `frontend/src/pages/password-reset-page.tsx`
- `.github/workflows/security-gates.yml`

## 9. Assumptions and Unknowns
- Frontend indicates risk: cookie-auth security still depends on backend/session cookie and CSRF enforcement at runtime.
- Needs backend/runtime verification: file-serving MIME and disposition behavior for contract downloads.
- Needs backend/runtime verification: edge TLS/HSTS/headers could differ from container nginx.
- Needs backend/runtime verification: branch-protection and required-check enforcement lives in GitHub settings.
