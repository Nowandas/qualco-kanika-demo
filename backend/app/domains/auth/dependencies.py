import hmac
from functools import lru_cache

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import get_settings
from app.core.database import get_db
from app.core.rate_limit import SlidingWindowRateLimiter
from app.domains.users.repository import UserRepository

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)
INTERNAL_USER_FIELDS = {
    "password_hash",
    "failed_login_attempts",
    "last_failed_login_at",
    "login_locked_until",
    "last_successful_login_at",
}
SAFE_HTTP_METHODS = {"GET", "HEAD", "OPTIONS"}


class AuthRequestRateLimiter:
    def __init__(self) -> None:
        settings = get_settings()
        self._trust_proxy_headers = settings.trust_proxy_headers
        self._login_limiter = SlidingWindowRateLimiter(
            max_requests=settings.auth_login_rate_limit_requests,
            window_seconds=settings.auth_login_rate_limit_window_seconds,
        )
        self._sensitive_limiter = SlidingWindowRateLimiter(
            max_requests=settings.auth_sensitive_rate_limit_requests,
            window_seconds=settings.auth_sensitive_rate_limit_window_seconds,
        )

    def _client_identifier(self, request: Request) -> str:
        if self._trust_proxy_headers:
            forwarded_for = request.headers.get("x-forwarded-for", "").strip()
            if forwarded_for:
                first_hop = forwarded_for.split(",", maxsplit=1)[0].strip()
                if first_hop:
                    return first_hop
        return request.client.host if request.client else "unknown"

    async def check(self, request: Request) -> tuple[bool, int]:
        path = request.url.path.rstrip("/")
        client = self._client_identifier(request)

        limiter: SlidingWindowRateLimiter | None = None
        limiter_key = ""
        if path.endswith("/auth/login"):
            limiter = self._login_limiter
            limiter_key = f"auth_login:{client}"
        elif path.endswith("/auth/accept-invitation"):
            limiter = self._sensitive_limiter
            limiter_key = f"auth_accept_invitation:{client}"
        elif "/auth/password-reset" in path:
            limiter = self._sensitive_limiter
            limiter_key = f"auth_password_reset:{client}"

        if limiter is None:
            return True, 0

        decision = await limiter.check(limiter_key)
        return decision.allowed, decision.retry_after_seconds


@lru_cache(maxsize=1)
def get_auth_request_rate_limiter() -> AuthRequestRateLimiter:
    return AuthRequestRateLimiter()


async def enforce_auth_rate_limit(request: Request) -> None:
    allowed, retry_after = await get_auth_request_rate_limiter().check(request)
    if allowed:
        return

    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Too many requests for this endpoint. Please try again later.",
        headers={"Retry-After": str(retry_after)},
    )


async def resolve_access_token(request: Request, bearer_token: str | None = Depends(oauth2_scheme)) -> str:
    settings = get_settings()
    if bearer_token:
        return bearer_token

    cookie_token = request.cookies.get(settings.auth_cookie_name)
    if cookie_token:
        method = request.method.upper()
        if method not in SAFE_HTTP_METHODS:
            csrf_cookie = request.cookies.get(settings.csrf_cookie_name)
            csrf_header = request.headers.get(settings.csrf_header_name)
            if not csrf_cookie or not csrf_header or not hmac.compare_digest(csrf_cookie, csrf_header):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="CSRF token validation failed",
                )
        return cookie_token

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )


async def get_current_user(
    token: str = Depends(resolve_access_token),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    settings = get_settings()
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )

    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError as exc:
        raise credentials_exception from exc

    repository = UserRepository(db)
    user = await repository.get_by_id(user_id)
    if user is None or not user.get("is_active", False):
        raise credentials_exception

    for key in INTERNAL_USER_FIELDS:
        user.pop(key, None)
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


async def require_staff_or_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") not in {"admin", "staff"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff access required")
    return user
