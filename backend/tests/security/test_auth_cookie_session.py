import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, status
from starlette.requests import Request
from starlette.responses import Response

from app.core.security import clear_auth_cookie, set_auth_cookie
from app.domains.auth.dependencies import resolve_access_token


def _request_with_headers(path: str, headers: list[tuple[bytes, bytes]] | None = None) -> Request:
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "GET",
        "path": path,
        "raw_path": path.encode("utf-8"),
        "query_string": b"",
        "headers": headers or [],
        "client": ("127.0.0.1", 50000),
        "scheme": "http",
        "server": ("testserver", 80),
    }
    return Request(scope)


def test_resolve_access_token_accepts_cookie_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.domains.auth.dependencies.get_settings",
        lambda: SimpleNamespace(auth_cookie_name="kanika_demo_access_token"),
    )

    request = _request_with_headers(
        "/api/v1/auth/me",
        headers=[(b"cookie", b"kanika_demo_access_token=cookie-token-value")],
    )

    token = asyncio.run(resolve_access_token(request=request, bearer_token=None))
    assert token == "cookie-token-value"


def test_resolve_access_token_prefers_bearer_token_when_present(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.domains.auth.dependencies.get_settings",
        lambda: SimpleNamespace(auth_cookie_name="kanika_demo_access_token"),
    )
    request = _request_with_headers(
        "/api/v1/auth/me",
        headers=[(b"cookie", b"kanika_demo_access_token=cookie-token-value")],
    )

    token = asyncio.run(resolve_access_token(request=request, bearer_token="bearer-token-value"))
    assert token == "bearer-token-value"


def test_resolve_access_token_raises_when_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.domains.auth.dependencies.get_settings",
        lambda: SimpleNamespace(auth_cookie_name="kanika_demo_access_token"),
    )
    request = _request_with_headers("/api/v1/auth/me")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(resolve_access_token(request=request, bearer_token=None))

    assert exc.value.status_code == status.HTTP_401_UNAUTHORIZED


def test_set_auth_cookie_uses_secure_http_only_flags(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.core.security.get_settings",
        lambda: SimpleNamespace(
            access_token_expire_minutes=15,
            auth_cookie_name="kanika_demo_access_token",
            auth_cookie_secure=True,
            auth_cookie_samesite="lax",
            auth_cookie_path="/",
            auth_cookie_domain=None,
        ),
    )

    response = Response()
    set_auth_cookie(response, "token-123")
    header = response.headers.get("set-cookie", "")

    assert "kanika_demo_access_token=token-123" in header
    assert "HttpOnly" in header
    assert "Secure" in header
    assert "SameSite=lax" in header


def test_clear_auth_cookie_sets_delete_header(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.core.security.get_settings",
        lambda: SimpleNamespace(
            auth_cookie_name="kanika_demo_access_token",
            auth_cookie_path="/",
            auth_cookie_domain=None,
        ),
    )

    response = Response()
    clear_auth_cookie(response)
    header = response.headers.get("set-cookie", "")

    assert "kanika_demo_access_token=" in header
    assert "Max-Age=0" in header
