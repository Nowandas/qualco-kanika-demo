import asyncio
from types import SimpleNamespace
from typing import Any

from app.core.security import verify_password
from app.domains.users.service import UserService


class FakeUserRepository:
    def __init__(self, existing: dict[str, Any] | None):
        self.existing = existing
        self.created_with: dict[str, Any] | None = None
        self.updated_with: dict[str, Any] | None = None

    async def get_by_email(self, email: str) -> dict[str, Any] | None:
        if self.existing and self.existing.get("email") == email:
            return dict(self.existing)
        return None

    async def create(self, data: dict[str, Any]) -> dict[str, Any]:
        self.created_with = dict(data)
        created = {"id": "507f1f77bcf86cd799439011", **data}
        self.existing = dict(created)
        return created

    async def update(self, user_id: str, updates: dict[str, Any], now: Any) -> dict[str, Any]:
        self.updated_with = dict(updates)
        if not self.existing:
            self.existing = {"id": user_id}
        merged = {**self.existing, **updates, "updated_at": now}
        self.existing = dict(merged)
        return dict(merged)


def _build_service(repository: FakeUserRepository) -> UserService:
    service = UserService.__new__(UserService)
    service.repository = repository
    service.settings = SimpleNamespace(
        master_admin_email="bootstrap-admin@example.com",
        master_admin_password="StrongBootstrapPass123!",
        master_admin_full_name="System Admin",
    )
    return service


def test_ensure_master_admin_does_not_rotate_existing_password_hash() -> None:
    existing_password_hash = "$pbkdf2-sha256$29000$test$existing-password-hash"
    existing = {
        "id": "507f1f77bcf86cd799439012",
        "email": "bootstrap-admin@example.com",
        "full_name": "System Admin",
        "role": "admin",
        "is_active": True,
        "avatar_seed": "system-admin",
        "avatar_style": "adventurer-neutral",
        "password_hash": existing_password_hash,
    }
    repo = FakeUserRepository(existing=existing)
    service = _build_service(repo)

    result = asyncio.run(UserService.ensure_master_admin(service))

    assert repo.updated_with is not None
    assert "password_hash" not in repo.updated_with
    assert result["email"] == "bootstrap-admin@example.com"


def test_ensure_master_admin_creation_hashes_password() -> None:
    repo = FakeUserRepository(existing=None)
    service = _build_service(repo)

    created = asyncio.run(UserService.ensure_master_admin(service))

    assert repo.created_with is not None
    assert repo.created_with["email"] == "bootstrap-admin@example.com"
    assert repo.created_with["password_hash"] != service.settings.master_admin_password
    assert verify_password(service.settings.master_admin_password, repo.created_with["password_hash"])
    assert "password_hash" not in created
