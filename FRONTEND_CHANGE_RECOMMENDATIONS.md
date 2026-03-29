# Frontend Change Recommendations (By File/Path)

## `frontend/src/api/client.ts`
- issue summary: API base URL falls back to localhost (FESEC-001), credentials are always included without explicit CSRF header contract (FESEC-002), and no global timeout exists (FESEC-006).
- required change:
  - Remove localhost fallback for production builds.
  - Add strict environment validation for `VITE_API_BASE_URL`.
  - Add default request timeout and optional `AbortSignal` plumbing.
  - Add CSRF header attachment hook (paired with backend verification).
- suggested patch approach:
  - Introduce `resolveApiBaseUrl()` helper that throws in production when env is missing/localhost.
  - Set `timeout` on axios client (example: 10-15s baseline).
  - Add request interceptor to include CSRF header for mutating methods when token is present.
- production/security risk if left unchanged: Misconfigured deployments may target localhost; mutating cookie-auth calls may be CSRF-exposed depending on backend; hung requests degrade reliability and incident response.
- whether must-fix before deployment: Yes (env fallback and CSRF contract), timeout strongly recommended.
- whether backend/runtime validation is needed: Yes (CSRF behavior).

## `frontend/Dockerfile`
- issue summary: Build ARG default sets `VITE_API_BASE_URL` to localhost (FESEC-001).
- required change: Remove insecure default and force explicit build arg for non-dev builds.
- suggested patch approach:
  - Replace defaulted `ARG VITE_API_BASE_URL=http://localhost:8000/api/v1` with `ARG VITE_API_BASE_URL`.
  - Add build-time guard: fail if arg is empty or localhost in production build context.
- production/security risk if left unchanged: Containerized frontend may silently ship with invalid/insecure API target.
- whether must-fix before deployment: Yes.
- whether backend/runtime validation is needed: No.

## `frontend/src/pages/login-page.tsx`
- issue summary: Invitation token is parsed from URL query (FESEC-003).
- required change: Scrub sensitive query parameters immediately after first read.
- suggested patch approach:
  - Read token once from `URLSearchParams`.
  - Call `window.history.replaceState({}, document.title, cleanPathWithoutToken)` in `useEffect` after parsing.
- production/security risk if left unchanged: Token leakage via browser history, support captures, and referrer propagation.
- whether must-fix before deployment: Yes.
- whether backend/runtime validation is needed: Yes (token replay/TTL policy).

## `frontend/src/pages/password-reset-page.tsx`
- issue summary: Reset token is parsed from query and rendered in UI read-only field (FESEC-003).
- required change:
  - Remove visible token rendering.
  - Scrub token query params after capture.
- suggested patch approach:
  - Keep token only in transient state memory.
  - Replace token display with neutral status text (e.g., "Reset link detected").
  - Clear token from URL using `replaceState`.
- production/security risk if left unchanged: Elevated leakage risk for one-time reset credentials.
- whether must-fix before deployment: Yes.
- whether backend/runtime validation is needed: Yes.

## `frontend/src/features/users/use-users-management.ts`
- issue summary: Invitation links are generated with token in query string (FESEC-003).
- required change: Minimize token lifetime/exposure and prefer single-use exchange flow.
- suggested patch approach:
  - Keep current URL flow only as transitional.
  - Coordinate with backend for one-time token exchange endpoint; avoid long-lived raw token links.
  - Mark tokenized links as sensitive and non-shareable in UX copy.
- production/security risk if left unchanged: Leaked invitation links can be replayed if backend controls are weak.
- whether must-fix before deployment: Yes (or backend controls proven strong).
- whether backend/runtime validation is needed: Yes.

## `frontend/src/features/invitations/use-invitations-management.ts`
- issue summary: Invitation URL creation includes raw token parameter (FESEC-003).
- required change: Same treatment as user management invitation flow.
- suggested patch approach:
  - Align generation with secure one-time exchange mechanism.
  - Reduce exposure window and avoid storing/sharing raw token where not necessary.
- production/security risk if left unchanged: Same as above; token leakage and replay risk.
- whether must-fix before deployment: Yes (or backend controls proven strong).
- whether backend/runtime validation is needed: Yes.

## `frontend/src/pages/contracts-page.tsx`
- issue summary: Blob preview opens new tab without MIME allowlist checks (FESEC-004).
- required change: Enforce safe MIME allowlist before opening blob URLs.
- suggested patch approach:
  - Define allowlist (`application/pdf`, safe image types).
  - If MIME is disallowed/unknown, force download and show warning toast.
  - Keep `noopener,noreferrer` for `window.open` calls.
- production/security risk if left unchanged: Active content may be rendered unexpectedly if backend serves unsafe MIME.
- whether must-fix before deployment: Yes.
- whether backend/runtime validation is needed: Yes.

## `frontend/src/pages/contract-detail-page.tsx`
- issue summary: Same blob open risk as contracts listing page (FESEC-004).
- required change: Apply same MIME-gating helper/path as contracts page.
- suggested patch approach:
  - Extract shared utility for blob open/download with MIME policy.
  - Reuse utility across both pages for consistent behavior.
- production/security risk if left unchanged: Inconsistent and unsafe file rendering behavior remains.
- whether must-fix before deployment: Yes.
- whether backend/runtime validation is needed: Yes.

## `frontend/nginx.conf`
- issue summary: Missing CSP and Permissions-Policy baseline in static serving config (FESEC-005).
- required change:
  - Add `Content-Security-Policy` (start report-only if needed).
  - Add `Permissions-Policy`.
  - Ensure HSTS is enforced at TLS terminator/CDN.
- suggested patch approach:
  - Add header directives in nginx config for local/static deployment baseline.
  - Mirror/enforce equivalent headers at edge/CDN where production traffic terminates.
- production/security risk if left unchanged: Reduced browser-side mitigation against script injection and policy abuse.
- whether must-fix before deployment: Yes.
- whether backend/runtime validation is needed: Yes.

## `.github/workflows/security-gates.yml`
- issue summary: No explicit frontend build/lint/typecheck/test required job and action refs use mutable tags (FESEC-011).
- required change:
  - Add blocking frontend quality gate jobs.
  - Pin actions by immutable commit SHA.
- suggested patch approach:
  - Add `frontend-build`/`frontend-lint`/`frontend-typecheck`/`frontend-test` jobs with `needs` gating.
  - Replace `uses: actions/checkout@v4` style refs with pinned SHA refs.
- production/security risk if left unchanged: Broken frontend and mutable CI dependencies can pass pipeline controls.
- whether must-fix before deployment: Yes.
- whether backend/runtime validation is needed: Yes (branch protection and required checks enforcement).

## `frontend/src/lib/notify.tsx`
- issue summary: Raw backend error details can be shown directly to end users (FESEC-007) and inline styles may complicate strict CSP rollout (FESEC-012).
- required change:
  - Sanitize/map backend errors to user-safe messages.
  - Move inline styles to CSS classes/variables or define CSP nonce/hash plan.
- suggested patch approach:
  - Replace generic pass-through with code-based or status-based message mapping.
  - Add telemetry-only path for raw error details.
  - Refactor inline style objects into stylesheet classes.
- production/security risk if left unchanged: Internal backend details may leak; CSP enforcement can cause UI regressions.
- whether must-fix before deployment: Error sanitization soon; CSP style cleanup can follow with report-only validation.
- whether backend/runtime validation is needed: Yes.

## `frontend/src/main.tsx`
- issue summary: Missing explicit route error boundaries and inline style usage affecting strict CSP path (FESEC-008, FESEC-012).
- required change:
  - Add global and route-level fallback error boundaries.
  - Reduce inline style dependency where feasible.
- suggested patch approach:
  - Add top-level `<ErrorBoundary>` wrapper.
  - Add `errorElement` to router tree entries.
  - Move toaster layout styles into CSS class.
- production/security risk if left unchanged: Runtime crashes can lead to blank screens; strict CSP rollouts may break UX.
- whether must-fix before deployment: Error boundary recommended before go-live; CSP style refactor may be immediate post-deploy if report-only confirms low risk.
- whether backend/runtime validation is needed: Partial (CSP rollout validation).

## `frontend/src/lib/avatar.ts`
- issue summary: Avatar generation depends on third-party service and leaks metadata externally (FESEC-009).
- required change: Reduce external data exposure for avatars.
- suggested patch approach:
  - Move avatar generation behind backend proxy/cache or internal deterministic generator.
  - Ensure seed values do not contain sensitive identifiers.
- production/security risk if left unchanged: Privacy/data minimization concerns and third-party dependency reliability risk.
- whether must-fix before deployment: No.
- whether backend/runtime validation is needed: No.

## `frontend/vite.config.ts` and `frontend/vite.config.js`
- issue summary: Duplicate Vite config artifacts create drift risk (FESEC-010).
- required change: Keep single canonical config.
- suggested patch approach:
  - Keep `vite.config.ts` and remove committed generated `vite.config.js`/`vite.config.d.ts` if not required.
  - Add CI check to avoid duplicate config reintroduction.
- production/security risk if left unchanged: Security-related config can diverge across tooling.
- whether must-fix before deployment: No (but quick cleanup recommended).
- whether backend/runtime validation is needed: No.

# Optional Patches (High Confidence)

## Patch 1: Remove localhost API fallback (FESEC-001)
Target: `frontend/src/api/client.ts`

```diff
-const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";
+const rawApiBase = import.meta.env.VITE_API_BASE_URL;
+const isDev = import.meta.env.DEV;
+
+if (!rawApiBase && !isDev) {
+  throw new Error("Missing VITE_API_BASE_URL for non-development build");
+}
+
+if (!isDev && rawApiBase && /localhost|127\.0\.0\.1/.test(rawApiBase)) {
+  throw new Error("VITE_API_BASE_URL must not point to localhost in production");
+}
+
+const API_BASE_URL = rawApiBase ?? "http://localhost:8000/api/v1";
```

## Patch 2: Scrub URL tokens after parse (FESEC-003)
Target: `frontend/src/pages/login-page.tsx`, `frontend/src/pages/password-reset-page.tsx`

```diff
+useEffect(() => {
+  const url = new URL(window.location.href);
+  const hasSensitiveParams = url.searchParams.has("token") || url.searchParams.has("invitation");
+  if (!hasSensitiveParams) return;
+
+  url.searchParams.delete("token");
+  url.searchParams.delete("invitation");
+  const next = `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams.toString()}` : ""}${url.hash}`;
+  window.history.replaceState({}, document.title, next);
+}, []);
```

## Patch 3: Blob MIME allowlist guard (FESEC-004)
Target: `frontend/src/pages/contracts-page.tsx`, `frontend/src/pages/contract-detail-page.tsx`

```diff
+const SAFE_INLINE_MIME = new Set([
+  "application/pdf",
+  "image/png",
+  "image/jpeg",
+  "image/webp"
+]);
+
+function openBlobSafely(blob: Blob) {
+  const mime = (blob.type || "").toLowerCase().split(";")[0].trim();
+  const url = window.URL.createObjectURL(blob);
+
+  if (!SAFE_INLINE_MIME.has(mime)) {
+    const a = document.createElement("a");
+    a.href = url;
+    a.download = "download";
+    a.rel = "noopener noreferrer";
+    a.click();
+    window.URL.revokeObjectURL(url);
+    return;
+  }
+
+  window.open(url, "_blank", "noopener,noreferrer");
+}
```

## Patch 4: Header baseline expansion (FESEC-005)
Target: `frontend/nginx.conf`

```diff
 add_header X-Frame-Options "DENY" always;
 add_header Referrer-Policy "no-referrer" always;
+add_header Permissions-Policy "geolocation=(), camera=(), microphone=()" always;
+add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; connect-src 'self' https:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
```

Note: CSP values should be tuned to actual runtime dependencies and may start in report-only mode first.
