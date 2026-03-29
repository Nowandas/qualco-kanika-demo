from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import get_settings
from app.core.mongo_utils import utcnow
from app.core.security import verify_password
from app.domains.users.repository import UserRepository


class AuthService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.user_repository = UserRepository(db)
        self.settings = get_settings()

    async def authenticate(self, email: str, password: str) -> dict:
        user = await self.user_repository.get_by_email(email.lower())
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

        if not user.get("is_active", False):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User disabled")

        lockout_until = self._normalize_datetime(user.get("login_locked_until"))
        if lockout_until is not None:
            retry_after = self._seconds_until(lockout_until)
            if retry_after > 0:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many failed login attempts. Try again later.",
                    headers={"Retry-After": str(retry_after)},
                )

        if not verify_password(password, user["password_hash"]):
            lockout_reached, retry_after = await self._record_failed_login_attempt(user)
            if lockout_reached:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many failed login attempts. Try again later.",
                    headers={"Retry-After": str(retry_after)},
                )
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

        await self._clear_failed_login_state(user)
        return user

    @staticmethod
    def _normalize_datetime(value: object) -> datetime | None:
        if not isinstance(value, datetime):
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    @staticmethod
    def _seconds_until(target: datetime) -> int:
        now = datetime.now(timezone.utc)
        delta = target - now
        return max(0, int(delta.total_seconds()))

    async def _record_failed_login_attempt(self, user: dict) -> tuple[bool, int]:
        now = utcnow()
        failed_attempts = int(user.get("failed_login_attempts") or 0) + 1
        updates: dict[str, object] = {
            "failed_login_attempts": failed_attempts,
            "last_failed_login_at": now,
        }

        lockout_reached = failed_attempts >= self.settings.auth_login_max_failed_attempts
        retry_after_seconds = 0
        if lockout_reached:
            lockout_until = now + timedelta(minutes=self.settings.auth_login_lockout_minutes)
            updates["login_locked_until"] = lockout_until
            updates["failed_login_attempts"] = 0
            retry_after_seconds = max(1, int((lockout_until - now).total_seconds()))

        await self.user_repository.update(user["id"], updates, now)
        return lockout_reached, retry_after_seconds

    async def _clear_failed_login_state(self, user: dict) -> None:
        updates: dict[str, object] = {"last_successful_login_at": utcnow()}

        if user.get("failed_login_attempts"):
            updates["failed_login_attempts"] = 0
        if user.get("login_locked_until") is not None:
            updates["login_locked_until"] = None
        if user.get("last_failed_login_at") is not None:
            updates["last_failed_login_at"] = None

        await self.user_repository.update(user["id"], updates, utcnow())
