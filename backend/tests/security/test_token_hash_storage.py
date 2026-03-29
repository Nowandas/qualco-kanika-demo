import asyncio
from datetime import timedelta
from types import SimpleNamespace
from typing import Any

import pytest

from app.core.mongo_utils import utcnow
from app.core.security import hash_one_time_token
from app.domains.invitations.repository import InvitationRepository
from app.domains.invitations.schemas import InvitationCreate
from app.domains.invitations.service import InvitationService
from app.domains.password_resets.repository import PasswordResetRepository
from app.domains.password_resets.schemas import PasswordResetCreate
from app.domains.password_resets.service import PasswordResetService


class FakeInvitationRepository:
    def __init__(self) -> None:
        self.created_payload: dict[str, Any] | None = None

    async def create(self, data: dict[str, Any]) -> dict[str, Any]:
        self.created_payload = dict(data)
        created = dict(data)
        created["id"] = "invitation-1"
        return created


class FakePasswordResetRepository:
    def __init__(self) -> None:
        self.created_payload: dict[str, Any] | None = None
        self.latest_reset: dict[str, Any] | None = None
        self.revoked_user_ids: list[str] = []

    async def revoke_active_for_user(self, user_id: str, _revoked_at) -> None:
        self.revoked_user_ids.append(user_id)

    async def create(self, data: dict[str, Any]) -> dict[str, Any]:
        self.created_payload = dict(data)
        created = dict(data)
        created["id"] = "reset-1"
        self.latest_reset = dict(created)
        return created

    async def get_by_token(self, token: str) -> dict[str, Any] | None:
        if not self.latest_reset:
            return None
        if self.latest_reset.get("token_hash") != hash_one_time_token(token):
            return None
        return dict(self.latest_reset)


class FakeUserRepository:
    def __init__(self, by_id: dict[str, Any] | None = None, by_email: dict[str, Any] | None = None) -> None:
        self._by_id = dict(by_id) if by_id else None
        self._by_email = dict(by_email) if by_email else None

    async def get_by_id(self, user_id: str) -> dict[str, Any] | None:
        if self._by_id and self._by_id.get("id") == user_id:
            return dict(self._by_id)
        return None

    async def get_by_email(self, email: str) -> dict[str, Any] | None:
        if self._by_email and self._by_email.get("email") == email:
            return dict(self._by_email)
        return None


class FakeTokenCollection:
    def __init__(self, doc: dict[str, Any]) -> None:
        self.doc = dict(doc)
        self.update_calls: list[dict[str, Any]] = []

    async def find_one(self, query: dict[str, Any]) -> dict[str, Any] | None:
        if "token_hash" in query:
            if self.doc.get("token_hash") == query["token_hash"]:
                return dict(self.doc)
            return None
        if "token" in query:
            if self.doc.get("token") == query["token"]:
                return dict(self.doc)
            return None
        return None

    async def update_one(self, query: dict[str, Any], update: dict[str, Any]):
        self.update_calls.append({"query": dict(query), "update": dict(update)})
        if self.doc.get("_id") != query.get("_id"):
            return SimpleNamespace(modified_count=0)
        if query.get("token_hash") == {"$exists": False} and "token_hash" in self.doc:
            return SimpleNamespace(modified_count=0)

        for key, value in update.get("$set", {}).items():
            self.doc[key] = value
        for key in update.get("$unset", {}):
            self.doc.pop(key, None)
        return SimpleNamespace(modified_count=1)


def test_invitation_create_stores_hashed_token_and_returns_raw_once(monkeypatch: pytest.MonkeyPatch) -> None:
    raw_token = "invite-token-plain-value-1234567890"
    monkeypatch.setattr("app.domains.invitations.service.secrets.token_urlsafe", lambda _size: raw_token)

    repository = FakeInvitationRepository()
    user_repository = FakeUserRepository()

    service = InvitationService.__new__(InvitationService)
    service.repository = repository
    service.user_repository = user_repository

    created = asyncio.run(
        service.create_invitation(
            InvitationCreate(email="new.user@example.com", role="staff", expires_in_hours=24),
            created_by_user_id="admin-1",
        )
    )

    assert created["token"] == raw_token
    assert repository.created_payload is not None
    assert "token" not in repository.created_payload
    assert repository.created_payload["token_hash"] == hash_one_time_token(raw_token)
    assert repository.created_payload["token_hint"] == f"{raw_token[:6]}...{raw_token[-4:]}"


def test_password_reset_create_stores_hashed_token_and_context_omits_token(monkeypatch: pytest.MonkeyPatch) -> None:
    raw_token = "password-reset-token-plain-abcdef123456"
    monkeypatch.setattr("app.domains.password_resets.service.secrets.token_urlsafe", lambda _size: raw_token)

    repository = FakePasswordResetRepository()
    user_repository = FakeUserRepository(
        by_id={
            "id": "user-1",
            "email": "staff@example.com",
            "full_name": "Staff User",
        }
    )

    service = PasswordResetService.__new__(PasswordResetService)
    service.repository = repository
    service.user_repository = user_repository

    created = asyncio.run(
        service.create_password_reset_link(
            user_id="user-1",
            payload=PasswordResetCreate(expires_in_hours=24),
            created_by_user_id="admin-1",
        )
    )

    assert created["token"] == raw_token
    assert repository.created_payload is not None
    assert "token" not in repository.created_payload
    assert repository.created_payload["token_hash"] == hash_one_time_token(raw_token)
    assert repository.created_payload["token_hint"] == f"{raw_token[:6]}...{raw_token[-4:]}"
    assert repository.revoked_user_ids == ["user-1"]

    context = asyncio.run(service.get_reset_context(raw_token))
    assert context["user_id"] == "user-1"
    assert context["user_email"] == "staff@example.com"
    assert "token" not in context


def test_password_reset_repository_migrates_legacy_plaintext_token_on_lookup() -> None:
    legacy_token = "legacy-reset-token-123456"
    doc = {
        "_id": "legacy-reset-1",
        "user_id": "user-1",
        "expires_at": utcnow() + timedelta(hours=1),
        "token": legacy_token,
    }
    collection = FakeTokenCollection(doc)
    repository = PasswordResetRepository.__new__(PasswordResetRepository)
    repository.collection = collection

    found = asyncio.run(repository.get_by_token(legacy_token))

    assert found is not None
    assert found["id"] == "legacy-reset-1"
    assert found["token_hash"] == hash_one_time_token(legacy_token)
    assert "token" not in found
    assert collection.doc.get("token_hash") == hash_one_time_token(legacy_token)
    assert "token" not in collection.doc
    assert len(collection.update_calls) == 1


def test_invitation_repository_migrates_legacy_plaintext_token_on_lookup() -> None:
    legacy_token = "legacy-invitation-token-098765"
    doc = {
        "_id": "legacy-invite-1",
        "email": "invited@example.com",
        "role": "member",
        "expires_at": utcnow() + timedelta(hours=4),
        "token": legacy_token,
    }
    collection = FakeTokenCollection(doc)
    repository = InvitationRepository.__new__(InvitationRepository)
    repository.collection = collection

    found = asyncio.run(repository.get_by_token(legacy_token))

    assert found is not None
    assert found["id"] == "legacy-invite-1"
    assert found["token_hash"] == hash_one_time_token(legacy_token)
    assert "token" not in found
    assert collection.doc.get("token_hash") == hash_one_time_token(legacy_token)
    assert "token" not in collection.doc
    assert len(collection.update_calls) == 1
