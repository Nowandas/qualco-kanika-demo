# Auth Domain

## Purpose

Authentication workflows for:

- login/logout
- invitation acceptance
- password-reset token validation and consumption

Master admin login uses environment values:
- `MASTER_ADMIN_EMAIL`
- `MASTER_ADMIN_PASSWORD`

## Security Controls

- Auth-sensitive endpoints are rate-limited (`/auth/login`, `/auth/accept-invitation`, `/auth/password-reset*`).
- Failed login attempts trigger temporary account lockout (`AUTH_LOGIN_MAX_FAILED_ATTEMPTS`, `AUTH_LOGIN_LOCKOUT_MINUTES`).
- Login and invitation acceptance set HTTP-only auth cookies (`AUTH_COOKIE_*`) and CSRF cookie.
- Mutating cookie-auth requests require CSRF header/cookie match (`CSRF_HEADER_NAME`, `CSRF_COOKIE_NAME`).
- Bearer token auth remains supported for compatibility.
- Invitation/password-reset tokens are stored hashed at rest.

## Endpoints

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/accept-invitation`
- `GET /api/v1/auth/password-reset/{token}`
- `POST /api/v1/auth/password-reset`

## Example (Cookie Auth)

```bash
curl -i -c cookies.txt -X POST http://localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<master-admin-email>","password":"<master-admin-password>"}'
```

```bash
CSRF=$(grep kanika_demo_csrf_token cookies.txt | awk '{print $7}')
curl -i -b cookies.txt -X POST http://localhost:8000/api/v1/auth/logout \
  -H "X-CSRF-Token: ${CSRF}"
```
