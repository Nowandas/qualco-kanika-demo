from functools import lru_cache

from pydantic import Field
from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


LOCAL_ENVS = {"local", "dev", "development", "test"}
DISALLOWED_JWT_SECRETS = {
    "",
    "change-me",
    "change-me-in-production",
    "changeme",
    "secret",
    "default",
    "test",
    "replace-with-a-strong-random-secret-at-least-32-chars",
}
DISALLOWED_MASTER_ADMIN_EMAILS = {
    "",
    "admin@admin.com",
    "admin@example.com",
    "bootstrap-admin@example.com",
}
DISALLOWED_MASTER_ADMIN_PASSWORDS = {
    "",
    "test123@",
    "changeme",
    "change-me",
    "password",
    "admin123",
    "replace-with-a-strong-bootstrap-password",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = Field(default="kanika-demo", alias="APP_NAME")
    app_env: str = Field(default="local", alias="APP_ENV")
    app_host: str = Field(default="0.0.0.0", alias="APP_HOST")
    app_port: int = Field(default=8000, alias="APP_PORT")
    trust_proxy_headers: bool = Field(default=False, alias="TRUST_PROXY_HEADERS")

    cors_allow_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173",
        alias="CORS_ALLOW_ORIGINS",
    )
    cors_allow_methods: str = Field(
        default="GET,POST,PUT,PATCH,DELETE,OPTIONS",
        alias="CORS_ALLOW_METHODS",
    )
    cors_allow_headers: str = Field(
        default="Authorization,Content-Type,Accept,Origin,X-Requested-With,X-CSRF-Token",
        alias="CORS_ALLOW_HEADERS",
    )
    cors_expose_headers: str = Field(default="Retry-After,X-Request-ID", alias="CORS_EXPOSE_HEADERS")
    cors_allow_credentials: bool = Field(default=True, alias="CORS_ALLOW_CREDENTIALS")

    mongo_uri: str = Field(default="mongodb://localhost:27017", alias="MONGO_URI")
    mongo_db_name: str = Field(default="kanika_demo", alias="MONGO_DB_NAME")

    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    openai_base_url: str | None = Field(default=None, alias="OPENAI_BASE_URL")
    openai_pricing_model: str = Field(default="gpt-5.2", alias="OPENAI_PRICING_MODEL")
    seed_path_ingestion_enabled: bool = Field(default=False, alias="SEED_PATH_INGESTION_ENABLED")
    seed_ingestion_root: str | None = Field(default=None, alias="SEED_INGESTION_ROOT")

    jwt_secret_key: str = Field(default="replace-with-a-strong-random-secret-at-least-32-chars", alias="JWT_SECRET_KEY")
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    access_token_expire_minutes: int = Field(default=1440, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    auth_cookie_name: str = Field(default="kanika_demo_access_token", alias="AUTH_COOKIE_NAME")
    auth_cookie_secure: bool = Field(default=False, alias="AUTH_COOKIE_SECURE")
    auth_cookie_samesite: str = Field(default="lax", alias="AUTH_COOKIE_SAMESITE")
    auth_cookie_path: str = Field(default="/", alias="AUTH_COOKIE_PATH")
    auth_cookie_domain: str | None = Field(default=None, alias="AUTH_COOKIE_DOMAIN")
    csrf_cookie_name: str = Field(default="kanika_demo_csrf_token", alias="CSRF_COOKIE_NAME")
    csrf_header_name: str = Field(default="X-CSRF-Token", alias="CSRF_HEADER_NAME")
    auth_login_rate_limit_requests: int = Field(default=10, alias="AUTH_LOGIN_RATE_LIMIT_REQUESTS")
    auth_login_rate_limit_window_seconds: int = Field(default=60, alias="AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS")
    auth_sensitive_rate_limit_requests: int = Field(default=30, alias="AUTH_SENSITIVE_RATE_LIMIT_REQUESTS")
    auth_sensitive_rate_limit_window_seconds: int = Field(default=60, alias="AUTH_SENSITIVE_RATE_LIMIT_WINDOW_SECONDS")
    auth_login_max_failed_attempts: int = Field(default=5, alias="AUTH_LOGIN_MAX_FAILED_ATTEMPTS")
    auth_login_lockout_minutes: int = Field(default=15, alias="AUTH_LOGIN_LOCKOUT_MINUTES")

    master_admin_email: str = Field(default="bootstrap-admin@example.com", alias="MASTER_ADMIN_EMAIL")
    master_admin_password: str = Field(default="replace-with-a-strong-bootstrap-password", alias="MASTER_ADMIN_PASSWORD")
    master_admin_full_name: str = Field(default="System Admin", alias="MASTER_ADMIN_FULL_NAME")

    @staticmethod
    def _parse_csv(value: str) -> list[str]:
        return [item.strip() for item in value.split(",") if item.strip()]

    @property
    def cors_allow_origins_list(self) -> list[str]:
        return self._parse_csv(self.cors_allow_origins)

    @property
    def cors_allow_methods_list(self) -> list[str]:
        return self._parse_csv(self.cors_allow_methods)

    @property
    def cors_allow_headers_list(self) -> list[str]:
        return self._parse_csv(self.cors_allow_headers)

    @property
    def cors_expose_headers_list(self) -> list[str]:
        return self._parse_csv(self.cors_expose_headers)

    @model_validator(mode="after")
    def validate_security_baseline(self) -> "Settings":
        """Fail fast in non-local environments when insecure defaults are used."""
        app_env = self.app_env.strip().lower()

        if self.auth_login_rate_limit_requests < 1 or self.auth_login_rate_limit_window_seconds < 1:
            raise ValueError("AUTH_LOGIN_RATE_LIMIT_REQUESTS and AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS must be >= 1.")
        if self.auth_sensitive_rate_limit_requests < 1 or self.auth_sensitive_rate_limit_window_seconds < 1:
            raise ValueError(
                "AUTH_SENSITIVE_RATE_LIMIT_REQUESTS and AUTH_SENSITIVE_RATE_LIMIT_WINDOW_SECONDS must be >= 1."
            )
        if self.auth_login_max_failed_attempts < 1:
            raise ValueError("AUTH_LOGIN_MAX_FAILED_ATTEMPTS must be >= 1.")
        if self.auth_login_lockout_minutes < 1:
            raise ValueError("AUTH_LOGIN_LOCKOUT_MINUTES must be >= 1.")
        if self.access_token_expire_minutes < 1:
            raise ValueError("ACCESS_TOKEN_EXPIRE_MINUTES must be >= 1.")

        self.auth_cookie_samesite = self.auth_cookie_samesite.strip().lower()
        if self.auth_cookie_samesite not in {"lax", "strict", "none"}:
            raise ValueError("AUTH_COOKIE_SAMESITE must be one of: lax, strict, none.")

        if self.auth_cookie_samesite == "none" and not self.auth_cookie_secure:
            raise ValueError("AUTH_COOKIE_SECURE must be true when AUTH_COOKIE_SAMESITE=none.")
        if not self.auth_cookie_name.strip():
            raise ValueError("AUTH_COOKIE_NAME must not be empty.")
        if not self.csrf_cookie_name.strip():
            raise ValueError("CSRF_COOKIE_NAME must not be empty.")
        if not self.csrf_header_name.strip():
            raise ValueError("CSRF_HEADER_NAME must not be empty.")
        if not self.auth_cookie_path.strip():
            raise ValueError("AUTH_COOKIE_PATH must not be empty.")

        if self.auth_cookie_domain is not None and not self.auth_cookie_domain.strip():
            self.auth_cookie_domain = None

        cors_origins = self.cors_allow_origins_list
        cors_headers = {item.lower() for item in self.cors_allow_headers_list}
        if not cors_origins:
            raise ValueError("CORS_ALLOW_ORIGINS must contain at least one origin.")
        if self.cors_allow_credentials and "*" in cors_origins:
            raise ValueError("CORS_ALLOW_ORIGINS cannot contain '*' when CORS_ALLOW_CREDENTIALS=true.")
        if self.csrf_header_name.lower() not in cors_headers:
            raise ValueError("CORS_ALLOW_HEADERS must include CSRF_HEADER_NAME.")

        if app_env in LOCAL_ENVS:
            return self

        if not self.auth_cookie_secure:
            raise ValueError("AUTH_COOKIE_SECURE must be true in non-local environments.")
        if "*" in cors_origins:
            raise ValueError("CORS_ALLOW_ORIGINS cannot contain '*' in non-local environments.")

        jwt_secret = self.jwt_secret_key.strip()
        if jwt_secret.lower() in DISALLOWED_JWT_SECRETS or len(jwt_secret) < 32:
            raise ValueError(
                "JWT_SECRET_KEY is too weak for non-local environments. "
                "Use a unique value with at least 32 characters."
            )

        master_admin_email = self.master_admin_email.strip().lower()
        if master_admin_email in DISALLOWED_MASTER_ADMIN_EMAILS:
            raise ValueError("MASTER_ADMIN_EMAIL uses a default placeholder in non-local environments.")

        master_admin_password = self.master_admin_password.strip()
        if (
            master_admin_password.lower() in DISALLOWED_MASTER_ADMIN_PASSWORDS
            or len(master_admin_password) < 12
        ):
            raise ValueError(
                "MASTER_ADMIN_PASSWORD is too weak for non-local environments. "
                "Use a unique value with at least 12 characters."
            )

        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
