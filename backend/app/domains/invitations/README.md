# Invitations Domain

## Purpose

Invite-only onboarding with expiring, single-use tokens and role assignment.

## Endpoints

- `GET /api/v1/invitations` (admin)
- `POST /api/v1/invitations` (admin)
- `POST /api/v1/auth/accept-invitation` (public, token consumption)

## Security Controls

- Invitation tokens are stored hashed at rest (`token_hash`).
- Raw invitation token is returned only once when invitation is created.
- Invitation list responses expose masked token hints only.
- Accepted invitations become non-reusable (`accepted_at` is set).
- Accept-invitation endpoint is rate-limited.

## Notes

- Accepting invitation issues authenticated session cookie and CSRF cookie.
- Legacy plaintext invitation token records are migrated opportunistically when resolved.
