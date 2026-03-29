# Security Audit & Hardening Plan

## Execution Update (2026-03-29)
- Hardening implementation batches have been applied across backend, frontend, Docker, and CI.
- Auth/session security controls are active (cookie auth, CSRF enforcement, rate limiting, login lockout).
- Invitation/password-reset tokens are hashed at rest with compatibility migration handling.
- Upload handling is hardened with type allowlists, size limits, and admin-configurable upload caps.
- CI security gates are present under `.github/workflows/security-gates.yml`.

## 1. Executive Summary
Security posture has improved materially from the initial audit baseline. Core pre-deploy code/config hardening controls are now implemented in-repo, and major previously-blocking issues (unsafe defaults, weak token handling patterns, missing request controls) were addressed.

Deployment readiness status: **Conditionally ready after critical fixes**

## 2. Top Risks
1. Secret hygiene remains environment-dependent; local/test credentials and keys must be rotated before release.
2. Production edge controls (TLS termination, HSTS rollout, ingress header policy) require runtime verification.
3. Branch protection and merge-blocking enforcement must be confirmed in GitHub settings (outside code repo).
4. Production env values must be explicitly set (no placeholder or local fallback values).
5. Final staging validation is still required for abuse controls and upload edge cases under load.

## 3. Critical Findings
Current codebase review indicates no remaining known critical vulnerability that is clearly exploitable from repository evidence alone.

Pre-deploy blockers are primarily operational:
- production secret rotation and secure secret delivery
- production environment variable hardening
- runtime verification of edge/network controls

## 4. Hardening Recommendations
### application
- Keep sanitized error responses for external callers; use reference IDs for deep diagnostics.
- Keep provider-detail debugging restricted to local/dev/test only.
- Maintain upload extension + size enforcement and preserve admin-managed limit workflow.

### infrastructure
- Enforce non-root runtime and `no-new-privileges` for all production services.
- Keep MongoDB private to internal network in production (no host port publish).
- Validate reverse-proxy TLS + forwarded-header trust model (`TRUST_PROXY_HEADERS`).

### CI/CD
- Keep dependency, SAST, secret scan, and container scan jobs mandatory.
- Enforce merge blocking on high/critical thresholds and failing checks.
- Pin and periodically review CI actions/toolchain versions.

### secrets
- Rotate exposed/local dev secrets before any shared environment deployment.
- Use environment-scoped secret stores rather than static `.env` files in production.
- Enforce secret scanning in PR and default branch.

### auth
- Keep cookie + CSRF contract as the primary auth path.
- Keep lockout and endpoint rate limits tuned based on staging telemetry.
- Keep hashed token-at-rest model for invitation and reset flows.

### dependency hygiene
- Continue scheduled dependency update cadence.
- Re-run vulnerability scans on each release branch cut.
- Track parser/upload dependency advisories as part of release checklist.

### observability
- Preserve request/reference correlation for failure triage.
- Monitor auth abuse metrics (429s, lockouts, failed logins).
- Alert on repeated upstream AI failures and ingestion parse errors.

## 5. Quick Wins
- Rotate all non-placeholder secrets in `.env` and secrets manager.
- Validate production `VITE_API_BASE_URL`, CORS, and cookie settings before image build.
- Verify branch protection + required checks in GitHub UI.
- Run pre-release smoke tests for login, CSRF, upload limits, and reconciliation import.

## 6. Pre-Deployment Checklist
- [ ] Rotate JWT/admin/Mongo/OpenAI credentials and remove weak placeholders.
- [ ] Confirm non-local env passes startup security validation.
- [ ] Confirm production `VITE_API_BASE_URL` is non-local and correct.
- [ ] Validate CORS origins and CSRF headers from deployed frontend domain.
- [ ] Verify CI security gates are required and merge-blocking.
- [ ] Verify Mongo is not publicly exposed.
- [ ] Verify ingress/edge headers and TLS policy.
- [ ] Execute staging smoke/regression checks.

## 7. Post-Deployment Security Checklist
- [ ] Monitor auth abuse and lockout telemetry.
- [ ] Monitor upload rejection/error rates and parser failures.
- [ ] Run periodic dependency and container scans.
- [ ] Validate incident-response runbook with reference-ID tracing.
- [ ] Review and rotate credentials on schedule.

## 8. Files Reviewed
- `backend/app/main.py`
- `backend/app/core/config.py`
- `backend/app/core/security.py`
- `backend/app/core/rate_limit.py`
- `backend/app/domains/auth/*`
- `backend/app/domains/users/*`
- `backend/app/domains/invitations/*`
- `backend/app/domains/password_resets/*`
- `backend/app/domains/hospitality/*`
- `frontend/src/api/client.ts`
- `frontend/src/lib/notify.tsx`
- `frontend/src/pages/pricing-ingestion-page.tsx`
- `frontend/src/pages/reconciliations-page.tsx`
- `frontend/src/components/layout/upload-limits-settings-modal.tsx`
- `backend/Dockerfile`
- `frontend/Dockerfile`
- `docker-compose.yml`
- `docker-compose.dev.yml`
- `.github/workflows/security-gates.yml`
- `.env.example`
- `README.md`

## 9. Assumptions and Unknowns
- Edge/CDN/ingress TLS/header behavior is not fully represented in repo and needs runtime verification.
- GitHub branch protection settings must be validated in repository settings.
- Secret exposure in prior local history/artifacts cannot be verified from repo state alone.
