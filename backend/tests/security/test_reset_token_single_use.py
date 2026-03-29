import asyncio
from datetime import timedelta
from typing import Any

import pytest
from fastapi import HTTPException, status

from app.core.mongo_utils import utcnow
from app.core.security import get_password_hash
from app.domains.password_resets.service import PasswordResetService


class SingleUsePasswordResetRepository:
    def __init__(self, token: str, user_id: str) -> None:
        self.token = token
        self.record = {
            "id": "507f1f77bcf86cd799439199",
            "user_id": user_id,
            "expires_at": utcnow() + timedelta(hours=2),
            "consumed_at": None,
            "revoked_at": None,
        }

    async def get_by_token(self, token: str) -> dict[str, Any] | None:
        if token != self.token:
            return None
        return dict(self.record)

    async def mark_consumed(self, reset_id: str, consumed_at) -> bool:
        if reset_id != self.record["id"]:
            return False
        if self.record["consumed_at"] is not None or self.record["revoked_at"] is not None:
            return False
        self.record["consumed_at"] = consumed_at
        return True


class FakeUserRepository:
    def __init__(self, user: dict[str, Any]) -> None:
        self.user = dict(user)
        self.update_calls: list[dict[str, Any]] = []

    async def get_by_id(self, user_id: str) -> dict[str, Any] | None:
        if self.user.get("id") != user_id:
            return None
        return dict(self.user)

    async def update(self, user_id: str, updates: dict[str, Any], now):
        if self.user.get("id") != user_id:
            return None
        self.update_calls.append(dict(updates))
        self.user.update(updates)
        self.user["updated_at"] = now
        return dict(self.user)


def test_password_reset_token_is_single_use() -> None:
    token = "single-use-reset-token-1234567890"
    user = {
        "id": "user-1",
        "email": "staff@example.com",
        "full_name": "Staff User",
        "password_hash": get_password_hash("CurrentPass123!"),
    }
    repository = SingleUsePasswordResetRepository(token=token, user_id="user-1")
    user_repository = FakeUserRepository(user=user)

    service = PasswordResetService.__new__(PasswordResetService)
    service.repository = repository
    service.user_repository = user_repository

    asyncio.run(service.consume_reset(token, "NewSecurePass456!"))

    assert repository.record["consumed_at"] is not None
    assert len(user_repository.update_calls) == 1
    assert user_repository.user["password_hash"] != user["password_hash"]

    with pytest.raises(HTTPException) as exc:
        asyncio.run(service.consume_reset(token, "AnotherPass789!"))
    assert exc.value.status_code == status.HTTP_409_CONFLICT
    assert exc.value.detail == "Password reset token already used"
