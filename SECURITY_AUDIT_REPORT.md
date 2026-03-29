# Security Audit Report

## Implementation Status Snapshot (2026-03-28)
- `SEC-001` through `SEC-012` have code/config remediations implemented in-repo across Batches `B1` to `B7`.
- New security tests for token hashing/migration/single-use reset behavior were added in `backend/tests/security/`.
- CI/CD security gate workflows are present in `.github/workflows/security-gates.yml`.
- Runtime verification remains required for environment-dependent controls (edge headers/TLS behavior, external reachability, and branch protection policy enforcement).

## 1. Repository Context
- stack detected
  - Backend: FastAPI, Motor (MongoDB), python-jose JWT auth, passlib password hashing.
  - Frontend: React + Vite + Axios token-auth client.
  - Runtime: Docker Compose with `mongo`, `backend`, and `frontend` services.
- frameworks/libraries
  - Python deps include `fastapi`, `uvicorn`, `python-multipart`, `pypdf`, `openpyxl`, `openai`.
  - JS deps include `vite`, `axios`, `react-router-dom`.
- deployment signals
  - Current Dockerfiles/compose are demo/dev-oriented (`uvicorn --reload`, `npm run dev`, host port exposure, bind mounts).
  - No CI workflow or deployment policy files are present in tracked repository files.
- auth model if detectable
  - Bearer JWT in `Authorization` header.
  - Frontend stores token in `localStorage`.
  - Role checks are backend-enforced (`require_admin`).
  - Master admin account is auto-bootstrapped on startup.

## 2. Risk Summary Table
| ID | Severity | Category | Title | Location | Exploitability | Fix Effort | Needs Runtime Verification (Yes/No) |
|---|---|---|---|---|---|---|---|
| SEC-001 | critical | auth/secrets | Default bootstrap admin credentials and forced reset on startup | `backend/app/core/config.py`, `backend/app/domains/users/service.py`, `frontend/src/config/app.ts`, `frontend/src/pages/login-page.tsx`, `docker-compose.yml`, `README.md` | high | medium | No |
| SEC-002 | critical | auth/crypto | Weak JWT secret fallback and no startup guard | `backend/app/core/config.py`, `backend/app/core/security.py` | high | small | No |
| SEC-003 | critical | dependency/upload | Vulnerable upload/parser dependency chain plus unbounded file reads | `backend/requirements.txt`, `backend/app/domains/hospitality/service.py` | high | medium | No |
| SEC-004 | high | data store/infra | MongoDB exposed and no auth controls visible in compose | `docker-compose.yml`, `backend/app/core/config.py` | high | medium | Yes |
| SEC-005 | high | deployment/runtime | Development runtime configuration in deploy artifacts | `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml` | medium | medium | No |
| SEC-006 | high | session/browser | Bearer token in localStorage with permissive CORS and missing header hardening | `frontend/src/api/client.ts`, `backend/app/main.py`, `frontend/index.html` | medium | medium | Yes |
| SEC-007 | high | auth abuse protection | No rate limiting/brute-force protection on auth/token-sensitive endpoints | `backend/app/domains/auth/router.py`, `backend/app/main.py` | high | medium | No |
| SEC-008 | high | file handling | Admin path-ingestion endpoints allow arbitrary server file reads | `backend/app/domains/hospitality/service.py`, `backend/app/domains/hospitality/router.py` | medium | small | No |
| SEC-009 | medium | information disclosure | Raw exception details returned to clients | `backend/app/domains/hospitality/service.py`, `backend/app/domains/hospitality/router.py` | medium | small | No |
| SEC-010 | high | frontend supply chain | Vite/esbuild/picomatch advisories with dev-server exposure in container runtime | `frontend/package.json`, `frontend/package-lock.json`, `frontend/Dockerfile` | medium | medium | No |
| SEC-011 | medium | token lifecycle | Invitation/password reset tokens handled in plaintext and exposed in URLs/UI | `backend/app/domains/password_resets/schemas.py`, `backend/app/domains/password_resets/service.py`, `backend/app/domains/invitations/schemas.py`, `backend/app/domains/auth/router.py`, `frontend/src/pages/password-reset-page.tsx` | medium | medium | Yes |
| SEC-012 | medium | ci_cd/governance | Missing CI/CD security gates and release controls | repository-wide (no `.github/workflows` tracked) | medium | medium | Yes |

## 3. Detailed Findings

### [SEC-001] Default bootstrap admin credentials and forced reset on startup
- Severity: critical
- Category: auth/secrets
- Location: `backend/app/core/config.py:26`, `backend/app/core/config.py:27`, `backend/app/domains/users/service.py:74`, `backend/app/domains/users/service.py:93`, `frontend/src/config/app.ts:5`, `frontend/src/pages/login-page.tsx:19`, `frontend/src/pages/login-page.tsx:103`, `docker-compose.yml:29`, `docker-compose.yml:30`, `README.md:62`
- Confidence: high
- Description: The application ships with known default admin credentials and surfaces them in both backend defaults and frontend UI. Startup logic also re-applies the configured master admin password hash each boot.
- Why this matters: Known credentials + automatic reset behavior can create persistent privileged access and invalidate post-incident credential changes.
- Attack / Failure Scenario: Attacker attempts default credentials, or waits for service restart to regain access after password rotation.
- Evidence:
  - Default values in config and docs.
  - Frontend pre-fills and displays bootstrap credentials.
  - `ensure_master_admin()` always writes `password_hash` from configured master admin password.
- Recommended Fix:
  - Remove all default admin credentials from code/docs/UI.
  - Bootstrap admin exactly once via explicit init job/command.
  - Never reset an existing admin password at app startup.
- Implementation Notes:
  - Add startup check: if `APP_ENV != local` and bootstrap credentials are default/weak, fail fast.
  - Track bootstrap completion with a DB flag/migration marker.
- Validation Steps:
  - Attempt startup with default credentials in non-local env; startup must fail.
  - Change admin password, restart app, verify password remains unchanged.
  - Confirm login page no longer exposes bootstrap credentials.

### [SEC-002] Weak JWT secret fallback and no startup guard
- Severity: critical
- Category: auth/crypto
- Location: `backend/app/core/config.py:22`, `backend/app/core/security.py:30`, `backend/app/domains/auth/dependencies.py:24`
- Confidence: high
- Description: JWT signing secret has a weak fallback (`change-me`) and there is no strict production-time enforcement for entropy/length.
- Why this matters: Misconfigured environments can allow offline token forgery and privilege escalation.
- Attack / Failure Scenario: Deployment starts with default secret; attacker signs arbitrary admin JWT and passes role checks.
- Evidence:
  - `jwt_secret_key` default in settings.
  - Tokens are signed/verified with this secret.
- Recommended Fix:
  - Fail startup unless strong secret policy is met (e.g., >=32 bytes random).
  - Rotate any existing secrets and invalidate active tokens.
  - Consider asymmetric signing (RS/EdDSA) with managed key rotation.
- Implementation Notes:
  - Add validation in settings model and startup bootstrap.
  - Use env-specific secret manager in production.
- Validation Steps:
  - Start with weak secret in non-local env; app must refuse startup.
  - Confirm JWT verification fails for old tokens after rotation.

### [SEC-003] Vulnerable upload/parser dependency chain plus unbounded file reads
- Severity: critical
- Category: dependency/upload
- Location: `backend/requirements.txt:9`, `backend/requirements.txt:10`, `backend/app/domains/hospitality/service.py:509`, `backend/app/domains/hospitality/service.py:749`, `backend/app/domains/hospitality/service.py:1049`, `backend/app/domains/hospitality/service.py:1132`, `backend/app/domains/hospitality/service.py:2128`
- Confidence: high
- Description: Dependency audit reported multiple known vulnerabilities in `python-multipart`, `pypdf`, and transitive `starlette`. Upload handlers read full request files into memory and parse complex formats.
- Why this matters: Crafted files/requests can trigger CPU/RAM exhaustion and degrade or block service availability.
- Attack / Failure Scenario: Attacker submits malformed or highly compressed multipart/PDF payloads to ingestion endpoints causing event-loop stalls or memory pressure.
- Evidence:
  - `pip-audit` found 25 vulnerabilities across 4 packages (`python-jose`, `python-multipart`, `pypdf`, `starlette`).
  - File handling repeatedly does `content = await upload_file.read()` before validation.
- Recommended Fix:
  - Upgrade to patched versions (minimum: `python-multipart>=0.0.22`, `pypdf>=6.9.2`, fastapi/starlette chain including `starlette>=0.49.1`).
  - Add strict max upload size and parser timeout/resource guards.
  - Reject unsupported media types before full reads when possible.
- Implementation Notes:
  - Centralize upload guards in middleware/dependency.
  - Consider async streaming/chunked handling for large file classes.
- Validation Steps:
  - Re-run `pip-audit` and confirm no high/critical advisories in active code path.
  - Execute stress tests with malformed oversized files; ensure graceful rejection.

### [SEC-004] MongoDB exposed and no auth controls visible in compose
- Severity: high
- Category: data store/infra
- Location: `docker-compose.yml:8`, `docker-compose.yml:9`, `backend/app/core/config.py:15`, `docker-compose.yml:27`
- Confidence: high
- Description: MongoDB is published on host port `27017` and app connection uses URI without credentials in repository defaults.
- Why this matters: If deployed beyond localhost/private network, unauthorized DB access can lead to full data compromise or destructive writes.
- Attack / Failure Scenario: External actor connects to exposed MongoDB endpoint and reads/modifies collections without app auth.
- Evidence:
  - Compose publishes DB port.
  - No root username/password config shown in compose.
- Recommended Fix:
  - Remove host port mapping in production.
  - Enable MongoDB auth/TLS and least-privilege DB users.
  - Restrict network access via firewall/VPC/security groups.
- Implementation Notes:
  - Keep separate compose/helm profiles for dev vs prod.
- Validation Steps:
  - Confirm DB not reachable from public network.
  - Verify unauthenticated DB connection attempts fail.
- Needs runtime verification: Network topology and external exposure.

### [SEC-005] Development runtime configuration in deploy artifacts
- Severity: high
- Category: deployment/runtime
- Location: `backend/Dockerfile:17`, `frontend/Dockerfile:12`, `frontend/package.json:7`, `docker-compose.yml:34`, `docker-compose.yml:49`
- Confidence: high
- Description: Backend starts with `--reload`, frontend runs Vite dev server, and both services mount source code volumes.
- Why this matters: Development servers reduce production safety guarantees, increase attack surface, and can expose tooling vulnerabilities.
- Attack / Failure Scenario: Publicly exposed dev server endpoint abuse, unstable runtime behavior, or unintended live code changes via mounted volumes.
- Evidence:
  - Docker CMD uses dev entrypoints.
  - Compose mounts source directories.
- Recommended Fix:
  - Build production artifacts and run hardened runtime (`uvicorn` without reload; static frontend served by hardened web server).
  - Remove source bind mounts for production deployments.
- Implementation Notes:
  - Use multi-stage Docker builds.
- Validation Steps:
  - Verify production container command lines and immutable filesystem behavior.

### [SEC-006] Bearer token in localStorage with permissive CORS and missing header hardening
- Severity: high
- Category: session/browser
- Location: `frontend/src/api/client.ts:12`, `frontend/src/api/client.ts:20`, `backend/app/main.py:50`, `backend/app/main.py:51`, `frontend/index.html:1`
- Confidence: medium
- Description: Access token is stored in `localStorage`, while backend CORS allows all origins and no additional browser security headers are configured in app code.
- Why this matters: Any XSS-capable context on same origin can exfiltrate tokens; broad CORS lowers defense-in-depth for token misuse scenarios.
- Attack / Failure Scenario: XSS or hostile script in trusted origin reads token from storage and performs privileged API actions.
- Evidence:
  - Token read/write to localStorage.
  - CORS configured with `allow_origins=["*"]` and `allow_credentials=True`.
- Recommended Fix:
  - Prefer HttpOnly secure cookies for auth tokens (or strongly harden CSP/XSS posture if bearer storage remains).
  - Restrict CORS to explicit trusted origins.
  - Add security headers at edge/app layer (CSP, frame policy, content-type options).
- Implementation Notes:
  - If frontend/backend share origin in production, prioritize cookie-based auth migration.
- Validation Steps:
  - Verify token cannot be read from JS (if moved to HttpOnly).
  - Verify CORS rejects unknown origins.
- Needs runtime verification: Final domain/origin topology and edge header enforcement.

### [SEC-007] No rate limiting or brute-force protections on sensitive endpoints
- Severity: high
- Category: auth abuse protection
- Location: `backend/app/domains/auth/router.py:20`, `backend/app/domains/auth/router.py:55`, `backend/app/domains/auth/router.py:64`, `backend/app/main.py:46`
- Confidence: high
- Description: Authentication and token-sensitive endpoints lack visible rate limiting/lockout controls.
- Why this matters: Enables credential stuffing, password spraying, and token guessing attempts at scale.
- Attack / Failure Scenario: Automated attacks repeatedly hit login/password-reset endpoints, causing account compromise or service degradation.
- Evidence:
  - No rate-limit middleware/library usage in backend.
- Recommended Fix:
  - Add endpoint and identity/IP-based throttling.
  - Add temporary lockout/backoff for failed logins.
  - Add monitoring alerts for abuse patterns.
- Implementation Notes:
  - Use middleware-backed counters (Redis or equivalent shared store).
- Validation Steps:
  - Verify aggressive request bursts are throttled and logged.

### [SEC-008] Admin path-ingestion endpoints allow arbitrary server file reads
- Severity: high
- Category: file handling
- Location: `backend/app/domains/hospitality/service.py:522`, `backend/app/domains/hospitality/service.py:525`, `backend/app/domains/hospitality/service.py:758`, `backend/app/domains/hospitality/service.py:761`, `backend/app/domains/hospitality/router.py:105`, `backend/app/domains/hospitality/router.py:230`
- Confidence: high
- Description: Path ingestion takes user-provided filesystem paths and reads file bytes directly.
- Why this matters: If admin token is compromised, attacker can exfiltrate arbitrary readable files from container/host mounts.
- Attack / Failure Scenario: Attacker calls ingestion-from-paths with `/app/.env` or other secrets, then retrieves stored file via contract file endpoint.
- Evidence:
  - `Path(path_value).read_bytes()` on untrusted request payload.
- Recommended Fix:
  - Disable these endpoints in production.
  - If needed, restrict to allowlisted seed directory and normalize/verify path containment.
- Implementation Notes:
  - Enforce `resolved_path.is_relative_to(allowed_root)` style checks (or equivalent).
- Validation Steps:
  - Attempt traversal/out-of-scope path reads; verify rejection.

### [SEC-009] Raw exception details returned to clients
- Severity: medium
- Category: information disclosure
- Location: `backend/app/domains/hospitality/service.py:2397`, `backend/app/domains/hospitality/service.py:2593`, `backend/app/domains/hospitality/service.py:2710`, `backend/app/domains/hospitality/service.py:5717`, `backend/app/domains/hospitality/service.py:6382`, `backend/app/domains/hospitality/router.py:277`
- Confidence: high
- Description: Several error handlers embed raw exception strings in HTTP responses.
- Why this matters: Internal details (upstream service messages, parser traces, schema internals) leak implementation information useful for attackers.
- Attack / Failure Scenario: Adversary submits malformed payloads to harvest internal stack/context hints and optimize exploit attempts.
- Evidence:
  - `detail=f"... {exc}"` patterns across upload/AI handlers.
- Recommended Fix:
  - Return generic error messages to clients.
  - Log full exception details server-side with correlation IDs.
- Implementation Notes:
  - Standardize error mapping via centralized exception handler.
- Validation Steps:
  - Trigger parser/AI failures and confirm responses no longer expose raw exception details.

### [SEC-010] Frontend dependency advisories (vite/esbuild/picomatch) with dev-server exposure
- Severity: high
- Category: frontend supply chain
- Location: `frontend/package.json:30`, `frontend/package-lock.json` (`vite 5.4.21`, `esbuild 0.21.5`, `picomatch 2.3.1/4.0.3`), `frontend/Dockerfile:12`
- Confidence: high
- Description: `npm audit` detected vulnerabilities in `vite`, `esbuild`, and `picomatch`; current container runtime uses Vite dev server.
- Why this matters: Dev-server class vulnerabilities become materially relevant when dev server is exposed beyond local development.
- Attack / Failure Scenario: Adversary targets dev-server behavior to read responses/send requests or trigger parsing/regex DoS.
- Evidence:
  - `npm audit --prefix frontend --json` reports 3 vulnerabilities (1 high, 2 moderate).
- Recommended Fix:
  - Upgrade frontend toolchain to patched versions and regenerate lockfile.
  - Never expose Vite dev server in production.
- Implementation Notes:
  - Move to static build output + hardened web server runtime.
- Validation Steps:
  - Re-run `npm audit` and verify clean or accepted-risk status.

### [SEC-011] Reset/invitation token handling uses plaintext and URL-token patterns
- Severity: medium
- Category: token lifecycle
- Location: `backend/app/domains/password_resets/schemas.py:15`, `backend/app/domains/password_resets/service.py:45`, `backend/app/domains/password_resets/service.py:62`, `backend/app/domains/invitations/schemas.py:19`, `backend/app/domains/invitations/service.py:38`, `backend/app/domains/auth/router.py:55`, `frontend/src/pages/password-reset-page.tsx:149`
- Confidence: medium
- Description: Tokens are stored and returned in plaintext and reset context is fetched via URL path token; frontend also displays reset token value.
- Why this matters: Tokens may leak through logs, browser history, screenshots, analytics/referrer flows, or datastore compromise.
- Attack / Failure Scenario: Leaked token grants unauthorized account onboarding/reset until expiry or consumption.
- Evidence:
  - Schema and service responses include token fields directly.
  - Reset endpoint includes token in route path.
- Recommended Fix:
  - Store token hashes at rest and compare hashes on consume.
  - Reduce token lifetime and enforce single-use semantics (already partially present).
  - Prefer POST body for token validation or opaque reset session flow.
- Implementation Notes:
  - Migrate existing token records carefully; backward compatibility window may be needed.
- Validation Steps:
  - Verify DB records no longer contain plaintext tokens.
  - Verify leaked old token cannot be replayed after migration.
- Needs runtime verification: Proxy/access log behavior and external analytics/referrer controls.

### [SEC-012] Missing CI/CD security gates and release controls
- Severity: medium
- Category: ci_cd/governance
- Location: repository-wide (no tracked `.github/workflows` or equivalent CI policy files)
- Confidence: high
- Description: No repository-visible CI/CD pipeline checks for security scanning, policy enforcement, or deployment gating.
- Why this matters: Vulnerable dependencies, insecure config changes, and secret leaks can ship without automated controls.
- Attack / Failure Scenario: Critical regression merges unnoticed and reaches production.
- Evidence:
  - Tracked file inventory contains no CI workflow definitions.
- Recommended Fix:
  - Add CI pipeline with SAST, dependency audit, secret scan, container scan, and policy checks.
  - Block merge/deploy on critical/high thresholds.
- Implementation Notes:
  - Add branch protection and signed artifact provenance checks.
- Validation Steps:
  - Create failing test PR (known vulnerable dep) and confirm merge/deploy is blocked.
- Needs runtime verification: Branch protection and deployment platform policy settings.

## 4. Hardening Roadmap
- Phase 1: Must fix before deployment
  - Remove default/admin bootstrap credentials from code/docs/UI and stop password reapplication on startup.
  - Enforce JWT secret strength + startup fail-fast policy.
  - Upgrade vulnerable backend/frontend dependencies impacting active runtime paths.
  - Replace dev runtime containers with production-grade images/processes.
  - Secure MongoDB auth/network posture.
  - Add upload size controls and auth/token endpoint rate limits.
- Phase 2: Should fix immediately after deployment
  - Migrate token handling to hashed storage and reduce token URL exposure.
  - Add token revocation + shorter-lived access tokens + refresh-token rotation.
  - Replace raw exception responses with generic client errors and structured server logging.
  - Restrict/remove path-based ingestion endpoints in production.
- Phase 3: Security maturity improvements
  - Implement CI/CD security gates and release policy-as-code.
  - Add full observability: security event logs, anomaly alerts, and audit trails.
  - Add recurring security testing (dependency drift, fuzzing of file parsers, periodic pen tests).

## 5. Dependency and Supply Chain Review
- risky packages
  - Python (`pip-audit`):
    - `python-jose==3.3.0` (CVE-2024-33663, CVE-2024-33664; fix `>=3.4.0`).
    - `python-multipart==0.0.12` (DoS + path traversal advisory paths; fixes reported up to `>=0.0.22`).
    - `pypdf==5.4.0` (multiple DoS/resource-exhaustion advisories; fixes reported up to `>=6.9.2`).
    - Transitive `starlette==0.40.0` vulnerabilities (DoS advisories; fixes `>=0.47.2` and `>=0.49.1`).
  - Frontend (`npm audit`):
    - `vite` advisory path through `esbuild`.
    - `esbuild<=0.24.2` advisory affecting dev server behavior.
    - `picomatch` ReDoS/method injection advisories.
- stale packages
  - Backend dependency set is pinned but significantly behind security-fix lines for upload-related components.
  - Frontend lockfile resolves vulnerable chain (`vite 5.4.21`, `esbuild 0.21.5`, `picomatch 2.3.1/4.0.3`).
- lockfile concerns
  - Python uses plain `requirements.txt` without hash pinning (`--require-hashes` absent).
  - Frontend lockfile exists but runtime still uses vulnerable versions.
- build pipeline risks
  - `npm install` in Dockerfile (instead of `npm ci`) reduces deterministic/reproducible installs.
  - Base images and actions are not digest-pinned in tracked deployment artifacts.

## 6. Secrets and Configuration Review
- exposed secrets
  - `.env` (local runtime file, git-ignored) contains a live-looking API key and default admin password values. Immediate rotation recommended if key has been used.
- weak secret loading patterns
  - JWT secret fallback remains weak (`change-me`).
  - Master admin credentials default to known values in settings and docs.
- unsafe defaults
  - Demo defaults are operationally privileged and can remain active without explicit production guardrails.
  - CORS is globally permissive.
- missing environment separation
  - No strong env-based enforcement gate (e.g., rejecting demo defaults when `APP_ENV` is non-local).

## 7. CI/CD and Deployment Review
- pipeline security issues
  - No repository-visible CI workflows for security testing.
- artifact integrity concerns
  - Runtime images not pinned by digest.
  - Development runtime behavior in deploy artifacts (`reload`, dev server).
- branch protection assumptions
  - Not visible in repo; must be validated in VCS settings.
- deployment gating suggestions
  - Enforce mandatory checks: dependency audits, secret scanning, SAST, container scan, IaC policy checks.
  - Add environment promotion gates requiring explicit approval after security checks pass.

## 8. Runtime Verification Tasks
1. Confirm production ingress enforces TLS 1.2+, HSTS, CSP, and strict security headers.
2. Confirm MongoDB is not externally reachable and requires authentication/TLS.
3. Validate branch protection and CI status checks are mandatory for default branch.
4. Verify no secrets are present in deployment logs, APM traces, or metrics labels.
5. Validate rate limits and lockout behavior with controlled brute-force simulation.
6. Confirm OpenAPI docs exposure policy (`/docs`, `/openapi.json`) in production.
7. Verify token leakage controls in reverse proxy/access logs (URL path/query redaction).
8. Validate storage/file-serving origin model to assess XSS/token-theft blast radius.

## 9. Final Verdict
**Block deployment**
