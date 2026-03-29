import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.mongo_utils import utcnow
from app.core.security import get_password_hash, hash_one_time_token, verify_password
from app.domains.password_resets.repository import PasswordResetRepository
from app.domains.password_resets.schemas import PasswordResetCreate
from app.domains.users.repository import UserRepository


def to_aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class PasswordResetService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.repository = PasswordResetRepository(db)
        self.user_repository = UserRepository(db)

    async def ensure_indexes(self) -> None:
        await self.repository.create_indexes()

    async def create_password_reset_link(
        self,
        user_id: str,
        payload: PasswordResetCreate,
        created_by_user_id: str,
    ) -> dict:
        user = await self.user_repository.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        now = utcnow()
        await self.repository.revoke_active_for_user(user_id, now)

        raw_token = secrets.token_urlsafe(32)
        reset = {
            "user_id": user_id,
            "user_email": user["email"],
            "user_full_name": user["full_name"],
            "token_hash": hash_one_time_token(raw_token),
            "token_hint": f"{raw_token[:6]}...{raw_token[-4:]}",
            "expires_at": now + timedelta(hours=payload.expires_in_hours),
            "consumed_at": None,
            "revoked_at": None,
            "created_by_user_id": created_by_user_id,
            "created_at": now,
        }
        created = await self.repository.create(reset)
        created["token"] = raw_token
        return created

    async def get_reset_context(self, token: str) -> dict:
        reset = await self._require_valid_token(token)

        user = await self.user_repository.get_by_id(reset["user_id"])
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        return {
            "user_id": user["id"],
            "user_email": user["email"],
            "user_full_name": user["full_name"],
            "expires_at": reset["expires_at"],
        }

    async def consume_reset(self, token: str, new_password: str) -> None:
        reset = await self._require_valid_token(token)

        user = await self.user_repository.get_by_id(reset["user_id"])
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        if verify_password(new_password, user["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="New password must be different from current password",
            )

        now = utcnow()
        consumed = await self.repository.mark_consumed(reset["id"], now)
        if not consumed:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Password reset token is no longer valid",
            )

        updated = await self.user_repository.update(
            user["id"],
            {"password_hash": get_password_hash(new_password)},
            now,
        )
        if not updated:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    async def _require_valid_token(self, token: str) -> dict:
        reset = await self.repository.get_by_token(token)
        if not reset:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Password reset token not found")

        if reset.get("consumed_at") is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Password reset token already used")

        if reset.get("revoked_at") is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Password reset token was replaced")

        expires_at = to_aware_utc(reset["expires_at"])
        if expires_at < utcnow():
            raise HTTPException(status_code=status.HTTP_410_GONE, detail="Password reset token expired")

        return reset
