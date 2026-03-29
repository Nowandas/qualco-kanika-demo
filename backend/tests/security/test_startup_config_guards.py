import pytest
from pydantic import ValidationError

from app.core.config import Settings


def _load_settings(monkeypatch: pytest.MonkeyPatch, **env: str) -> Settings:
    keys = (
        "APP_ENV",
        "AUTH_COOKIE_SECURE",
        "JWT_SECRET_KEY",
        "MASTER_ADMIN_EMAIL",
        "MASTER_ADMIN_PASSWORD",
    )
    for key in keys:
        monkeypatch.delenv(key, raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    return Settings(_env_file=None)


def test_allows_local_environment_with_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = _load_settings(
        monkeypatch,
        APP_ENV="local",
        JWT_SECRET_KEY="change-me",
        MASTER_ADMIN_EMAIL="admin@admin.com",
        MASTER_ADMIN_PASSWORD="test123@",
    )
    assert settings.app_env == "local"


def test_rejects_weak_jwt_secret_in_non_local_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(ValidationError, match="JWT_SECRET_KEY"):
        _load_settings(
            monkeypatch,
            APP_ENV="production",
            AUTH_COOKIE_SECURE="true",
            JWT_SECRET_KEY="change-me",
            MASTER_ADMIN_EMAIL="security-admin@example.com",
            MASTER_ADMIN_PASSWORD="VeryStrongAdminPass123!",
        )


def test_rejects_default_master_admin_credentials_in_non_local_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with pytest.raises(ValidationError, match="MASTER_ADMIN"):
        _load_settings(
            monkeypatch,
            APP_ENV="staging",
            AUTH_COOKIE_SECURE="true",
            JWT_SECRET_KEY="super-secure-jwt-secret-value-with-32-chars",
            MASTER_ADMIN_EMAIL="admin@admin.com",
            MASTER_ADMIN_PASSWORD="test123@",
        )


def test_rejects_placeholder_master_admin_credentials_in_non_local_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with pytest.raises(ValidationError, match="MASTER_ADMIN"):
        _load_settings(
            monkeypatch,
            APP_ENV="production",
            AUTH_COOKIE_SECURE="true",
            JWT_SECRET_KEY="super-secure-jwt-secret-value-with-32-chars",
            MASTER_ADMIN_EMAIL="bootstrap-admin@example.com",
            MASTER_ADMIN_PASSWORD="replace-with-a-strong-bootstrap-password",
        )


def test_rejects_insecure_auth_cookie_in_non_local_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(ValidationError, match="AUTH_COOKIE_SECURE"):
        _load_settings(
            monkeypatch,
            APP_ENV="production",
            AUTH_COOKIE_SECURE="false",
            JWT_SECRET_KEY="super-secure-jwt-secret-value-with-32-chars",
            MASTER_ADMIN_EMAIL="security-admin@example.com",
            MASTER_ADMIN_PASSWORD="VeryStrongAdminPass123!",
        )
