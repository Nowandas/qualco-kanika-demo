import asyncio
from datetime import timedelta
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException, status
from starlette.requests import Request

from app.core.mongo_utils import utcnow
from app.core.security import get_password_hash
from app.domains.auth.dependencies import AuthRequestRateLimiter
from app.domains.auth.service import AuthService


class FakeUserRepository:
    def __init__(self, user: dict[str, Any] | None):
        self.user = dict(user) if user else None
        self.update_calls: list[dict[str, Any]] = []

    async def get_by_email(self, email: str) -> dict[str, Any] | None:
        if self.user and self.user.get("email") == email:
            return dict(self.user)
        return None

    async def update(self, user_id: str, updates: dict[str, Any], now: Any) -> dict[str, Any] | None:
        self.update_calls.append(dict(updates))
        if not self.user:
            return None
        self.user.update(updates)
        self.user["updated_at"] = now
        return dict(self.user)


def _build_auth_service(repo: FakeUserRepository, max_failed: int = 5, lockout_minutes: int = 15) -> AuthService:
    service = AuthService.__new__(AuthService)
    service.user_repository = repo
    service.settings = SimpleNamespace(
        auth_login_max_failed_attempts=max_failed,
        auth_login_lockout_minutes=lockout_minutes,
    )
    return service


def _request(path: str, client_host: str = "127.0.0.1") -> Request:
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "POST",
        "path": path,
        "raw_path": path.encode("utf-8"),
        "query_string": b"",
        "headers": [],
        "client": (client_host, 50000),
        "scheme": "http",
        "server": ("testserver", 80),
    }
    return Request(scope)


def test_auth_request_rate_limiter_limits_login_attempts(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.domains.auth.dependencies.get_settings",
        lambda: SimpleNamespace(
            trust_proxy_headers=False,
            auth_login_rate_limit_requests=1,
            auth_login_rate_limit_window_seconds=60,
            auth_sensitive_rate_limit_requests=5,
            auth_sensitive_rate_limit_window_seconds=60,
        ),
    )

    limiter = AuthRequestRateLimiter()
    request = _request("/api/v1/auth/login")

    first = asyncio.run(limiter.check(request))
    second = asyncio.run(limiter.check(request))

    assert first == (True, 0)
    assert second[0] is False
    assert second[1] > 0


def test_auth_service_locks_after_threshold_of_failed_attempts() -> None:
    user = {
        "id": "507f1f77bcf86cd799439099",
        "email": "admin@example.com",
        "password_hash": get_password_hash("CorrectPass123!"),
        "is_active": True,
    }
    repo = FakeUserRepository(user)
    service = _build_auth_service(repo, max_failed=2, lockout_minutes=10)

    with pytest.raises(HTTPException) as first:
        asyncio.run(service.authenticate("admin@example.com", "wrong-password"))
    assert first.value.status_code == status.HTTP_401_UNAUTHORIZED

    with pytest.raises(HTTPException) as second:
        asyncio.run(service.authenticate("admin@example.com", "wrong-password"))
    assert second.value.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    assert int(second.value.headers["Retry-After"]) > 0
    assert any("login_locked_until" in call for call in repo.update_calls)


def test_auth_service_blocks_when_account_is_already_locked() -> None:
    user = {
        "id": "507f1f77bcf86cd799439100",
        "email": "locked@example.com",
        "password_hash": get_password_hash("CorrectPass123!"),
        "is_active": True,
        "login_locked_until": utcnow() + timedelta(minutes=5),
    }
    repo = FakeUserRepository(user)
    service = _build_auth_service(repo)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(service.authenticate("locked@example.com", "CorrectPass123!"))

    assert exc.value.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    assert int(exc.value.headers["Retry-After"]) > 0


def test_auth_service_resets_failed_login_state_on_success() -> None:
    user = {
        "id": "507f1f77bcf86cd799439101",
        "email": "staff@example.com",
        "password_hash": get_password_hash("CorrectPass123!"),
        "is_active": True,
        "failed_login_attempts": 2,
        "last_failed_login_at": utcnow(),
    }
    repo = FakeUserRepository(user)
    service = _build_auth_service(repo)

    authenticated = asyncio.run(service.authenticate("staff@example.com", "CorrectPass123!"))

    assert authenticated["email"] == "staff@example.com"
    assert repo.update_calls
    last_call = repo.update_calls[-1]
    assert last_call.get("failed_login_attempts") == 0
    assert last_call.get("last_failed_login_at") is None
    assert "last_successful_login_at" in last_call
