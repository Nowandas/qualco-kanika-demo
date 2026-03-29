# Change Recommendations By File/Path

## 1) `backend/app/domains/users/service.py`
- file path
  - `backend/app/domains/users/service.py`
- issue summary
  - Startup bootstrap forcibly resets master admin password hash each service restart.
- required change
  - Preserve existing master admin password unless an explicit bootstrap action is requested.
- suggested patch approach
  - Remove unconditional `password_hash` update in `ensure_master_admin()` and only set fields when creating user or during explicit rotation path.
  - Example patch:

```diff
@@
-        updates = {
-            "role": "admin",
-            "is_active": True,
-            "password_hash": get_password_hash(self.settings.master_admin_password),
-        }
+        updates = {
+            "role": "admin",
+            "is_active": True,
+        }
@@
-        updated = await self.repository.update(existing["id"], updates, utcnow())
+        updated = await self.repository.update(existing["id"], updates, utcnow())
```
- risk if left unchanged
  - Default/known credentials can be reactivated after restart; incident response and password rotations are undermined.
- whether must-fix before deployment
  - Yes

## 2) `backend/app/core/config.py`
- file path
  - `backend/app/core/config.py`
- issue summary
  - Weak default secrets/credentials and no production fail-fast validation.
- required change
  - Enforce minimum secret strength and reject default bootstrap credentials outside local/dev.
- suggested patch approach
  - Add validators (or startup checks) for `jwt_secret_key`, `master_admin_password`, and `master_admin_email` when `APP_ENV` is not local.
  - Example approach:

```diff
+from pydantic import model_validator
@@
 class Settings(BaseSettings):
@@
+    @model_validator(mode="after")
+    def validate_security_defaults(self):
+        non_local = self.app_env.lower() not in {"local", "dev", "development"}
+        weak_jwt = self.jwt_secret_key in {"change-me", "change-me-in-production"} or len(self.jwt_secret_key) < 32
+        weak_admin = self.master_admin_password == "test123@"
+        if non_local and (weak_jwt or weak_admin):
+            raise ValueError("Refusing to start with insecure auth defaults in non-local environment")
+        return self
```
- risk if left unchanged
  - Misconfigured production deployments remain susceptible to token forgery and default-credential compromise.
- whether must-fix before deployment
  - Yes

## 3) `frontend/src/config/app.ts` and `frontend/src/pages/login-page.tsx`
- file path
  - `frontend/src/config/app.ts`
  - `frontend/src/pages/login-page.tsx`
- issue summary
  - Default admin credentials are embedded, prefilled, and displayed to unauthenticated users.
- required change
  - Remove credential constants and do not pre-populate login fields.
- suggested patch approach
  - Delete `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` constants.
  - Initialize login state with empty strings and remove the bootstrap admin credential panel.
  - Example patch:

```diff
- export const DEFAULT_ADMIN_EMAIL = "admin@admin.com";
- export const DEFAULT_ADMIN_PASSWORD = "test123@";
```

```diff
- import { APP_NAME, DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD } from "@/config/app";
+ import { APP_NAME } from "@/config/app";
@@
- const [email, setEmail] = useState(DEFAULT_ADMIN_EMAIL);
- const [password, setPassword] = useState(DEFAULT_ADMIN_PASSWORD);
+ const [email, setEmail] = useState("");
+ const [password, setPassword] = useState("");
@@
- <div className="rounded-2xl bg-white/12 p-4 text-sm backdrop-blur">...</div>
+ {/* Removed bootstrap credential display for security */}
```
- risk if left unchanged
  - Immediate credential disclosure and predictable admin compromise risk.
- whether must-fix before deployment
  - Yes

## 4) `backend/app/main.py`
- file path
  - `backend/app/main.py`
- issue summary
  - CORS is globally permissive (`*`) with credentials allowed; app security headers are not enforced.
- required change
  - Restrict allowed origins and apply production-appropriate security middleware/header policy.
- suggested patch approach
  - Add allowlist-based CORS from env and disable wildcard behavior.
  - Disable docs/openapi in production or protect behind auth gateway.
  - Add middleware or edge config for HSTS/CSP/X-Content-Type-Options/X-Frame-Options.
- risk if left unchanged
  - Browser-based attack surface remains broad; token theft and cross-origin abuse risk increases.
- whether must-fix before deployment
  - Yes

## 5) `backend/app/domains/hospitality/service.py`
- file path
  - `backend/app/domains/hospitality/service.py`
- issue summary
  - Upload handlers read full files into memory, path-ingestion allows arbitrary file reads, and error responses leak internals.
- required change
  - Add upload size/type guards, restrict path ingestion, and sanitize exception messages.
- suggested patch approach
  - Introduce centralized upload guard:

```diff
+MAX_UPLOAD_BYTES = 10 * 1024 * 1024
@@
- content = await upload_file.read()
+ content = await upload_file.read(MAX_UPLOAD_BYTES + 1)
+ if len(content) > MAX_UPLOAD_BYTES:
+     raise HTTPException(status_code=413, detail="Uploaded file exceeds size limit")
```

  - Restrict seed paths:

```diff
+ALLOWED_SEED_ROOT = Path("/app/seeds").resolve()
@@
- path = Path(path_value)
+ path = Path(path_value).resolve()
+ if not str(path).startswith(str(ALLOWED_SEED_ROOT) + "/"):
+     raise HTTPException(status_code=403, detail="Path not allowed")
```

  - Replace `detail=f"...{exc}"` with generic messages and structured logs.
- risk if left unchanged
  - DoS from malformed/oversized uploads, sensitive file exfiltration, and internal information leakage.
- whether must-fix before deployment
  - Yes

## 6) `backend/app/domains/hospitality/router.py`
- file path
  - `backend/app/domains/hospitality/router.py`
- issue summary
  - Contract file download is served as inline with content type inherited from uploaded content.
- required change
  - Prefer attachment disposition and constrain content type for unsafe active content classes.
- suggested patch approach
  - Change response header to `attachment` for untrusted types and force safe media fallback.
- risk if left unchanged
  - Browser execution of attacker-uploaded active content may become possible under certain origin models.
- whether must-fix before deployment
  - Yes (if same-origin app/API deployment is planned)

## 7) `backend/requirements.txt`
- file path
  - `backend/requirements.txt`
- issue summary
  - Multiple vulnerable packages in active upload/auth path.
- required change
  - Upgrade to patched versions and verify compatibility.
- suggested patch approach
  - Target minimums:
    - `python-jose>=3.4.0`
    - `python-multipart>=0.0.22`
    - `pypdf>=6.9.2`
    - FastAPI stack version that pulls non-vulnerable `starlette` (>=0.49.1)
  - Re-run `pip-audit` and regression tests.
- risk if left unchanged
  - Known CVEs remain exploitable in production code paths.
- whether must-fix before deployment
  - Yes

## 8) `frontend/package.json` and `frontend/package-lock.json`
- file path
  - `frontend/package.json`
  - `frontend/package-lock.json`
- issue summary
  - `npm audit` reports Vite/esbuild/picomatch vulnerabilities.
- required change
  - Upgrade and re-lock frontend dependency graph.
- suggested patch approach
  - Update Vite/tooling to patched versions, regenerate lockfile with `npm install` or `npm update` and verify no high/critical advisories.
- risk if left unchanged
  - Toolchain vulnerabilities persist; risk amplified if dev server is exposed.
- whether must-fix before deployment
  - Yes

## 9) `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml`
- file path
  - `backend/Dockerfile`
  - `frontend/Dockerfile`
  - `docker-compose.yml`
- issue summary
  - Production uses development commands and root users with broad host exposure.
- required change
  - Build production images, run non-root users, and remove unnecessary public ports/volumes.
- suggested patch approach
  - Backend CMD without reload, frontend static build + minimal web server.
  - Remove source mounts in production profile.
  - Remove Mongo host port publication in production.
- risk if left unchanged
  - Higher exploitability and unstable production runtime posture.
- whether must-fix before deployment
  - Yes

## 10) `backend/app/domains/auth/router.py` and auth stack
- file path
  - `backend/app/domains/auth/router.py`
  - `backend/app/domains/auth/dependencies.py`
  - `backend/app/core/security.py`
- issue summary
  - No auth abuse controls and token lifecycle is weak (`logout` is stateless no-op, long TTL defaults).
- required change
  - Add rate limiting, lockout policy, shorter token TTL, and revocation/refresh strategy.
- suggested patch approach
  - Integrate rate-limiter middleware and store failed-attempt counters in Redis.
  - Introduce refresh token model and denylist for revoked access tokens.
- risk if left unchanged
  - Credential stuffing and replay risk remain elevated.
- whether must-fix before deployment
  - Yes

## 11) `backend/app/domains/password_resets/*` and `backend/app/domains/invitations/*`
- file path
  - `backend/app/domains/password_resets/schemas.py`
  - `backend/app/domains/password_resets/service.py`
  - `backend/app/domains/password_resets/repository.py`
  - `backend/app/domains/invitations/schemas.py`
  - `backend/app/domains/invitations/service.py`
  - `backend/app/domains/invitations/repository.py`
- issue summary
  - Reset/invitation tokens are returned/stored in plaintext and exposed in URL flows.
- required change
  - Hash tokens at rest and reduce direct token exposure in APIs/UI.
- suggested patch approach
  - Persist `token_hash` (SHA-256/HMAC) instead of plaintext token; compare hashes on lookup.
  - Return one-time opaque handles where possible; reduce URL token usage.
- risk if left unchanged
  - Token leakage can directly enable account takeover paths.
- whether must-fix before deployment
  - Should-fix immediately after critical blockers (or pre-deploy if high-assurance environment)
