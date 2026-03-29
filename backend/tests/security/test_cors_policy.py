import pytest
from pydantic import ValidationError

from app.core.config import Settings


def _load_settings(monkeypatch: pytest.MonkeyPatch, **env: str) -> Settings:
    keys = (
        "APP_ENV",
        "CORS_ALLOW_ORIGINS",
        "CORS_ALLOW_CREDENTIALS",
        "AUTH_COOKIE_SECURE",
        "JWT_SECRET_KEY",
        "MASTER_ADMIN_EMAIL",
        "MASTER_ADMIN_PASSWORD",
    )
    for key in keys:
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("JWT_SECRET_KEY", "super-secure-jwt-secret-value-with-32-chars")
    monkeypatch.setenv("MASTER_ADMIN_EMAIL", "security-admin@example.com")
    monkeypatch.setenv("MASTER_ADMIN_PASSWORD", "VeryStrongAdminPass123!")
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    return Settings(_env_file=None)


def test_parses_cors_allow_origin_list_from_csv(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = _load_settings(
        monkeypatch,
        APP_ENV="local",
        CORS_ALLOW_ORIGINS="https://app.example.com, https://admin.example.com",
    )
    assert settings.cors_allow_origins_list == [
        "https://app.example.com",
        "https://admin.example.com",
    ]


def test_rejects_wildcard_with_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(ValidationError, match="CORS_ALLOW_ORIGINS"):
        _load_settings(
            monkeypatch,
            APP_ENV="local",
            CORS_ALLOW_ORIGINS="*",
            CORS_ALLOW_CREDENTIALS="true",
        )


def test_rejects_wildcard_origin_in_non_local_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(ValidationError, match="CORS_ALLOW_ORIGINS"):
        _load_settings(
            monkeypatch,
            APP_ENV="production",
            AUTH_COOKIE_SECURE="true",
            CORS_ALLOW_ORIGINS="*",
            CORS_ALLOW_CREDENTIALS="false",
        )
