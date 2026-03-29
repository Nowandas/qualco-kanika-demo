# Users Domain

## Purpose

User management for:

- admin user lifecycle operations (list/update/status/role)
- admin-issued password reset links
- self-service profile/avatar/password updates

## Endpoints

- `GET /api/v1/users` (admin)
- `PATCH /api/v1/users/{user_id}` (admin)
- `POST /api/v1/users/{user_id}/password-reset-link` (admin)
- `PATCH /api/v1/users/me/avatar` (authenticated)
- `PATCH /api/v1/users/me/profile` (authenticated)
- `PATCH /api/v1/users/me/password` (authenticated)

## Security Rules

- `MASTER_ADMIN_EMAIL` is treated as protected master admin identity.
- Master admin cannot be disabled.
- Master admin role cannot be downgraded.
- Password-reset tokens are returned once at creation and stored hashed at rest.

## Notes

- Auth works with secure cookie session flow (preferred) and bearer compatibility mode.
- Self-service password change requires current password verification.
