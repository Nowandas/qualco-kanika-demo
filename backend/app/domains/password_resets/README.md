# Password Resets Domain

## Purpose

Admin-issued, expiring password-reset links for existing users.

## Flow

1. Admin creates reset token for an existing user.
2. Previous active reset links for that user are revoked.
3. User opens password reset page with token.
4. User submits new password.
5. Token is consumed and cannot be reused.

## Security Controls

- Reset tokens are stored hashed at rest (`token_hash`).
- Raw reset token is returned once at link creation time.
- Token validation/consumption endpoints are rate-limited.
- `GET /auth/password-reset/{token}` returns context without exposing raw token value back in payload.
- Legacy plaintext token records are migrated opportunistically when resolved.

## Endpoints

- `POST /api/v1/users/{user_id}/password-reset-link` (admin)
- `GET /api/v1/auth/password-reset/{token}` (public token validation)
- `POST /api/v1/auth/password-reset` (public token consumption)
