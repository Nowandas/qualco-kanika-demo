# Frontend Security Audit Report

## 1. Repository Context
- stack detected
  - Vite + React + TypeScript SPA
  - Axios API client with cookie-enabled requests
  - Tailwind CSS + custom UI primitives
- major libraries
  - `react`, `react-router-dom`, `axios`, `react-hot-toast`, `lucide-react`, `vite`
- auth/session model if detectable
  - Frontend uses cookie-auth (`withCredentials: true`) and a temporary in-memory bearer fallback (`legacyBearerToken`) after login/invitation acceptance.
  - No auth token persistence in `localStorage`/`sessionStorage` was detected.
- deployment shape if inferable
  - Multi-stage Docker build; production static serving via `nginxinc/nginx-unprivileged`.
  - SPA fallback configured in nginx (`try_files ... /index.html`).
  - API origin baked at build-time via `VITE_API_BASE_URL`.

## 2. Risk Summary Table
| ID | Severity | Category | Title | Location | Exploitability | Fix Effort | Needs Backend/Runtime Verification (Yes/No) |
|---|---|---|---|---|---|---|---|
| FESEC-001 | high | config | API base URL insecure fallback to localhost | `frontend/src/api/client.ts:3`, `frontend/Dockerfile:13` | high | small | No |
| FESEC-002 | high | session | Cookie-auth flow lacks visible CSRF contract | `frontend/src/api/client.ts:8`, auth flows in `frontend/src/lib/auth.tsx` | medium | medium | Yes |
| FESEC-003 | high | auth | Invitation/reset tokens handled in URL query and shown in UI | `frontend/src/pages/login-page.tsx:35`, `frontend/src/pages/password-reset-page.tsx:28`, `frontend/src/pages/password-reset-page.tsx:147`, `frontend/src/features/users/use-users-management.ts:7`, `frontend/src/features/invitations/use-invitations-management.ts:13` | high | medium | Yes |
| FESEC-004 | high | data_exposure | Blob file open flow lacks frontend MIME allowlist enforcement | `frontend/src/pages/contracts-page.tsx:85`, `frontend/src/pages/contract-detail-page.tsx:155` | medium | medium | Yes |
| FESEC-005 | high | deployment | Static-hosting security header policy is incomplete | `frontend/nginx.conf:8` | medium | small | Yes |
| FESEC-006 | medium | api_client | No axios timeout and no consistent cancellation controls | `frontend/src/api/client.ts` and request-heavy hooks under `frontend/src/features/*` | medium | medium | No |
| FESEC-007 | medium | data_exposure | Raw backend error details are surfaced directly in UI notifications | `frontend/src/lib/notify.tsx:146` | medium | small | Yes |
| FESEC-008 | medium | routing | Missing explicit route/global error boundaries | `frontend/src/main.tsx:42` | low | small | No |
| FESEC-009 | low | data_exposure | Third-party avatar rendering leaks metadata externally | `frontend/src/lib/avatar.ts:13` | low | small | No |
| FESEC-010 | low | vite | Duplicate Vite config files increase configuration drift risk | `frontend/vite.config.ts`, `frontend/vite.config.js` | low | small | No |
| FESEC-011 | medium | deployment | Frontend CI lacks explicit build/lint/test gating; actions use mutable version tags | `.github/workflows/security-gates.yml:53` | medium | medium | Yes |
| FESEC-012 | medium | react | Strict CSP compatibility risk from inline style usage | `frontend/src/main.tsx:97`, `frontend/src/lib/notify.tsx` | low | medium | Yes |

## 3. Detailed Findings

### [FESEC-001] API base URL insecure fallback to localhost
- Severity: high
- Category: config
- Location: `frontend/src/api/client.ts:3`, `frontend/Dockerfile:13`
- Confidence: high
- Description: The client defaults to `http://localhost:8000/api/v1` when `VITE_API_BASE_URL` is missing, and Docker build arg also defaults to localhost.
- Why this matters: A production build with missing env configuration can silently target localhost on end-user machines, causing auth failure, mixed-content issues, or unintended token/header delivery.
- Attack / Failure Scenario: A misconfigured production deployment ships with localhost API target; users' browsers send requests to local processes instead of intended backend.
- Evidence: `const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1"` and Docker ARG default mirrors this.
- Recommended Fix: Remove localhost fallback in production path and fail build/startup when env is not explicitly set.
- Implementation Notes: Add strict env validation at startup in frontend entry/client init; set CI/build gate to reject missing/localhost API base for non-dev builds.
- Validation Steps:
  - Build with missing `VITE_API_BASE_URL` should fail.
  - Production artifact should contain only approved API domain(s).
- Needs Backend/Runtime Verification: No

### [FESEC-002] Cookie-auth flow lacks visible CSRF contract
- Severity: high
- Category: session
- Location: `frontend/src/api/client.ts:8`, `frontend/src/lib/auth.tsx`
- Confidence: medium
- Description: The frontend always sends credentialed cross-origin requests (`withCredentials: true`) but does not include an explicit CSRF token/header pattern.
- Why this matters: Cookie-auth without robust CSRF controls can allow cross-site request abuse depending on backend cookie policy and CSRF defenses.
- Attack / Failure Scenario: If backend allows cross-site credentialed requests and lacks CSRF validation, attacker-controlled pages can trigger state-changing operations.
- Evidence: Axios client uses `withCredentials: true`; no CSRF request interceptor/header seen in frontend.
- Recommended Fix: Adopt and document CSRF strategy (e.g., double-submit token header) and enforce it for mutating requests.
- Implementation Notes: Frontend should read CSRF token from safe cookie/meta and attach custom header; backend must verify token.
- Validation Steps:
  - Verify mutating requests are rejected without CSRF token.
  - Verify cross-site form/script requests cannot perform authenticated state changes.
- Needs Backend/Runtime Verification: Yes

### [FESEC-003] Invitation/reset tokens handled in URL query and shown in UI
- Severity: high
- Category: auth
- Location: `frontend/src/pages/login-page.tsx:35`, `frontend/src/pages/password-reset-page.tsx:28`, `frontend/src/pages/password-reset-page.tsx:147`, `frontend/src/features/users/use-users-management.ts:7`, `frontend/src/features/invitations/use-invitations-management.ts:13`
- Confidence: high
- Description: One-time credential tokens are passed via query parameters and, for reset flows, shown in a read-only field.
- Why this matters: Query tokens can leak via browser history, screenshots, support captures, logs, and referrer chains.
- Attack / Failure Scenario: A leaked reset/invite URL is replayed before expiration/consumption.
- Evidence: URL parsing for `token`/`invitation`, link generation with query params, and reset token display input.
- Recommended Fix: Move to opaque short-lived flow (POST exchange/session binding), scrub query immediately after read, and avoid rendering raw token in UI.
- Implementation Notes: After parsing token once, call `history.replaceState(null, "", cleanPath)`.
- Validation Steps:
  - Token absent from URL after page init.
  - Token not displayed in visible UI unless explicitly needed.
  - Replayed token behavior verified as expected by backend.
- Needs Backend/Runtime Verification: Yes

### [FESEC-004] Blob file open flow lacks frontend MIME allowlist enforcement
- Severity: high
- Category: data_exposure
- Location: `frontend/src/pages/contracts-page.tsx:85`, `frontend/src/pages/contract-detail-page.tsx:155`
- Confidence: medium
- Description: Downloaded blobs are opened in new tabs based on response content-type without frontend allowlist checks.
- Why this matters: If backend returns unsafe content type or attacker-controlled file content, blob URL execution context may enable phishing or script execution patterns.
- Attack / Failure Scenario: A malicious uploaded asset is served and opened, leading to unsafe active content rendering.
- Evidence: `window.URL.createObjectURL(blob)` + `window.open(url, "_blank", "noopener,noreferrer")` with no frontend MIME gate.
- Recommended Fix: Enforce frontend allowlist (e.g., PDF/image) before opening; fallback to forced download for unknown types.
- Implementation Notes: Check normalized `content-type` and block active MIME classes (`text/html`, `application/javascript`).
- Validation Steps:
  - Unsafe MIME response is blocked and reported.
  - Allowed MIME opens correctly; unknown MIME downloads safely.
- Needs Backend/Runtime Verification: Yes

### [FESEC-005] Static-hosting security header policy is incomplete
- Severity: high
- Category: deployment
- Location: `frontend/nginx.conf:8`
- Confidence: high
- Description: Nginx static config sets only a small subset of security headers and omits CSP/permissions/HSTS policy assumptions.
- Why this matters: Missing browser hardening raises XSS/clickjacking and policy bypass risk.
- Attack / Failure Scenario: Frontend ships without strict CSP; injected script paths have fewer browser-level mitigations.
- Evidence: `nginx.conf` includes `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, but no CSP or Permissions-Policy.
- Recommended Fix: Add CSP and Permissions-Policy at static host or edge; define HSTS at TLS terminator.
- Implementation Notes: Prefer nonce-based CSP where needed; keep policy in deployment documentation and runtime checks.
- Validation Steps:
  - Verify headers in deployed responses.
  - Run CSP report-only before enforce mode.
- Needs Backend/Runtime Verification: Yes

### [FESEC-006] No axios timeout and no consistent cancellation controls
- Severity: medium
- Category: api_client
- Location: `frontend/src/api/client.ts` and async hooks under `frontend/src/features/*`
- Confidence: high
- Description: Requests have no global timeout and most effects/hooks do not use abort/cancel paths.
- Why this matters: Hanging requests increase resource exhaustion, stale state writes, and degraded availability under API/network stress.
- Attack / Failure Scenario: Slow/backpressured APIs leave UI hung and queue overlapping requests, causing degraded operator visibility.
- Evidence: Axios instance lacks `timeout`; hooks rely on long-running requests without abort signals.
- Recommended Fix: Add global timeout and use abort/cancel primitives in long-lived effects and query-heavy views.
- Implementation Notes: Standardize request wrapper with timeout + cancellation + consistent error mapping.
- Validation Steps:
  - Simulate slow API and verify cancellation/timeouts trigger safe UI fallback.
- Needs Backend/Runtime Verification: No

### [FESEC-007] Raw backend error details are surfaced directly in UI notifications
- Severity: medium
- Category: data_exposure
- Location: `frontend/src/lib/notify.tsx:146`
- Confidence: high
- Description: `apiErrorMessage` returns backend `detail` or `message` directly and feeds toast/UI state.
- Why this matters: If backend emits sensitive internals, frontend can expose them to end users.
- Attack / Failure Scenario: Parser/runtime/backend errors leak implementation details to unauthorized viewers.
- Evidence: `apiErrorMessage` returns `error.response.data.detail` when string.
- Recommended Fix: Map server messages to allowlisted user-safe texts; keep raw detail for internal telemetry only.
- Implementation Notes: Add error code mapping layer and redact unknown detail values.
- Validation Steps:
  - Force backend internal error and verify user sees generic message only.
- Needs Backend/Runtime Verification: Yes

### [FESEC-008] Missing explicit route/global error boundaries
- Severity: medium
- Category: routing
- Location: `frontend/src/main.tsx:42`
- Confidence: medium
- Description: Router tree lacks explicit `errorElement`, and app root lacks custom error boundary.
- Why this matters: Unhandled runtime errors may cause blank-screen failures and potentially expose framework error surfaces.
- Attack / Failure Scenario: Faulty API/render path crashes route and users see unstable fallback behavior.
- Evidence: `createBrowserRouter` route objects do not define `errorElement`; no top-level error boundary wrapper.
- Recommended Fix: Add route-level `errorElement` and top-level error boundary with safe user messaging.
- Implementation Notes: Include telemetry hook in error boundary for production diagnostics.
- Validation Steps:
  - Trigger controlled render exception and verify safe fallback page appears.
- Needs Backend/Runtime Verification: No

### [FESEC-009] Third-party avatar rendering leaks metadata externally
- Severity: low
- Category: data_exposure
- Location: `frontend/src/lib/avatar.ts:13`
- Confidence: high
- Description: Avatar URLs are fetched from `api.dicebear.com` with user-controlled seed in query parameters.
- Why this matters: External service receives request metadata and avatar seed values.
- Attack / Failure Scenario: External dependency outage/privacy issue affects avatar rendering and data minimization posture.
- Evidence: `return https://api.dicebear.com/.../svg?seed=...`.
- Recommended Fix: Proxy/cache avatars server-side or host deterministic avatar generation internally.
- Implementation Notes: If external service remains, document data-sharing posture and enforce strict referrer policy.
- Validation Steps:
  - Confirm no sensitive identifiers are used as seed values.
- Needs Backend/Runtime Verification: No

### [FESEC-010] Duplicate Vite config files increase drift risk
- Severity: low
- Category: vite
- Location: `frontend/vite.config.ts`, `frontend/vite.config.js`
- Confidence: high
- Description: Two Vite config files with overlapping config create maintenance ambiguity.
- Why this matters: Security/build settings can diverge unexpectedly across tooling/runtime assumptions.
- Attack / Failure Scenario: One config gets updated for hardening while another remains stale and is used in certain environments.
- Evidence: Both files define similar alias/plugin config.
- Recommended Fix: Keep one canonical config file and delete generated duplicate.
- Implementation Notes: Prefer `vite.config.ts` only.
- Validation Steps:
  - Build/dev commands use single config path.
- Needs Backend/Runtime Verification: No

### [FESEC-011] Frontend CI lacks explicit build/lint/test gate and uses mutable action tags
- Severity: medium
- Category: deployment
- Location: `.github/workflows/security-gates.yml:53`
- Confidence: high
- Description: Security scan workflow includes npm audit but does not enforce frontend build/lint/typecheck/test jobs; actions are pinned by major tags (`@v4`, `@v5`) not commit SHA.
- Why this matters: Security scans alone do not prevent broken or drifted frontend artifacts from shipping; mutable tags increase supply-chain risk.
- Attack / Failure Scenario: Compromised or changed action tag behavior impacts pipeline trust; broken frontend still passes security scan.
- Evidence: No frontend build/test jobs in current workflow; action refs use version tags.
- Recommended Fix: Add mandatory frontend build/typecheck/lint/test jobs and pin actions by SHA.
- Implementation Notes: Keep dependency audit as separate blocking gate.
- Validation Steps:
  - Intentionally break frontend build; CI must fail.
  - Confirm workflow actions resolve to pinned SHAs.
- Needs Backend/Runtime Verification: Yes

### [FESEC-012] Strict CSP compatibility risk from inline styles
- Severity: medium
- Category: react
- Location: `frontend/src/main.tsx:97`, `frontend/src/lib/notify.tsx`
- Confidence: medium
- Description: UI code uses inline style props (toaster container/animated progress), which can conflict with strict CSP `style-src` policies.
- Why this matters: Enforcing strict CSP later may break notifications or parts of UI unexpectedly.
- Attack / Failure Scenario: Deployment enables strict CSP and production UX degrades due blocked inline styles.
- Evidence: `containerStyle={{ top: 18, right: 18 }}` and inline `style={...}` usage in notification components.
- Recommended Fix: Move style logic to CSS classes/variables or adopt CSP nonce/hash strategy.
- Implementation Notes: Validate policy in report-only mode before strict enforcement.
- Validation Steps:
  - Enable CSP report-only and confirm zero style violations for critical flows.
- Needs Backend/Runtime Verification: Yes

## 4. Frontend Hardening Roadmap
- Phase 1: Must fix before deployment
  - FESEC-001 API base URL fallback removal and strict env gating.
  - FESEC-002 CSRF contract alignment for cookie-auth.
  - FESEC-003 Token URL scrubbing and reduced token UI exposure.
  - FESEC-004 Blob MIME allowlist before open.
  - FESEC-005 CSP/headers deployment baseline.
- Phase 2: Should fix immediately after deployment
  - FESEC-006 Axios timeout/cancellation framework.
  - FESEC-007 Safe frontend error-message mapping.
  - FESEC-008 Route/global error boundaries.
  - FESEC-011 Frontend CI build/lint/test + pinned actions.
  - FESEC-012 CSP compatibility cleanup.
- Phase 3: Frontend security maturity improvements
  - FESEC-009 Reduce third-party avatar dependency.
  - Centralized frontend threat modeling for file/AI-heavy operator workflows.
  - Add security-focused e2e smoke tests (auth boundary, token handling, unsafe file responses).

## 5. Dependency and Supply Chain Review
- risky packages
  - No active high/critical npm advisories were returned in current local audit (`npm audit --prefix frontend --audit-level=high --json` => 0 vulnerabilities).
- stale packages
  - Outdated check could not be reliably completed in this audit run due environment/network execution limitations.
- plugin concerns
  - Vite plugin set is minimal (`@vitejs/plugin-react` only), reducing plugin attack surface.
- build pipeline risks
  - CI does not yet enforce frontend build/lint/test gates in workflow shown.
  - GitHub actions pinned by mutable tags rather than immutable SHAs.

## 6. Vite Configuration Review
- env handling
  - `import.meta.env.VITE_API_BASE_URL` is used correctly as the client-visible var.
  - Risk: unsafe localhost fallback remains.
- plugin review
  - Only official React plugin present; no unreviewed Vite plugin chain found.
- build output exposure
  - Dist output inspected: no sourcemap files were found.
- source maps
  - No explicit `sourcemap` setting in config; current build output suggests sourcemaps are not emitted.
- public assets
  - `frontend/public` has no tracked files; no obvious static leak there.
- proxy assumptions
  - No Vite dev proxy configuration detected.

## 7. Auth / Session / API Client Review
- token handling
  - Positive: auth tokens are not persisted in browser storage.
  - Risk: temporary bearer fallback still exists in-memory and can couple to misconfigured API base URL.
- storage concerns
  - `localStorage` usage is limited to selected hotel scope (non-sensitive preference state).
- route/auth assumptions
  - Route guards (`RequireAuth`, `RequireAdmin`) are UI controls only; backend authorization remains mandatory.
- interceptor/client issues
  - Request interceptor attaches bearer token fallback.
  - Missing timeout and missing centralized cancellation.
- frontend/backend trust boundaries
  - Frontend indicates risk: CSRF controls are not visible client-side while credentials are included in requests.

## 8. Deployment Exposure Review
- prod build risks
  - Default API origin fallback can produce invalid/insecure deployment behavior.
- static asset exposure
  - Blob open flow can render unsafe content types if backend serves unexpected MIME.
- config leakage
  - No direct secret embedding found in frontend env usage.
- runtime assumptions
  - Query token flow assumes safe browser/referrer/log handling.
  - Static host header policy assumes stronger controls may be added upstream.
- hosting/security header assumptions
  - Nginx config lacks CSP/Permissions-Policy; HSTS must be handled by TLS edge.

## 9. Runtime Verification Tasks
- Verify deployed bundle API target is correct and never localhost.
- Verify CSRF behavior for cookie-auth requests from actual frontend domain.
- Verify reset/invitation token URLs are scrubbed and not leaked via analytics/referrer logs.
- Verify backend rejects unsafe file content types for file-open endpoints.
- Verify CSP and other security headers on CDN/edge responses.
- Verify branch protection enforces required frontend/security checks.

## 10. Final Verdict
- **Deploy only after critical remediation**
