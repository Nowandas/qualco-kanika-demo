from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import get_settings
from app.core.mongo_utils import utcnow
from app.core.security import get_password_hash, verify_password
from app.domains.users.repository import UserRepository
from app.domains.users.schemas import UserCreate, UserPasswordUpdate, UserProfileUpdate, UserUpdate


class UserService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.repository = UserRepository(db)
        self.settings = get_settings()

    async def ensure_indexes(self) -> None:
        await self.repository.create_indexes()

    async def create_user(self, payload: UserCreate) -> dict:
        existing = await self.repository.get_by_email(payload.email)
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")

        now = utcnow()
        user_data = {
            "email": payload.email.lower(),
            "full_name": payload.full_name,
            "role": payload.role,
            "is_active": payload.is_active,
            "avatar_seed": payload.avatar_seed,
            "avatar_style": payload.avatar_style,
            "password_hash": get_password_hash(payload.password),
            "created_at": now,
            "updated_at": now,
        }
        return await self.repository.create(user_data)

    @staticmethod
    def _sanitize_user_output(user: dict) -> dict:
        for key in (
            "password_hash",
            "failed_login_attempts",
            "last_failed_login_at",
            "login_locked_until",
            "last_successful_login_at",
        ):
            user.pop(key, None)
        return user

    async def list_users(self) -> list[dict]:
        users = await self.repository.list_all()
        for user in users:
            self._sanitize_user_output(user)
        return users

    async def update_user(self, user_id: str, payload: UserUpdate) -> dict:
        existing = await self.repository.get_by_id(user_id)
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        updates = payload.model_dump(exclude_unset=True)
        is_master_admin = existing.get("email", "").lower() == self.settings.master_admin_email.lower()

        if is_master_admin:
            if updates.get("role") and updates.get("role") != "admin":
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Master admin role cannot be changed",
                )
            if updates.get("is_active") is False:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Master admin cannot be disabled",
                )

        if not updates:
            return self._sanitize_user_output(existing)

        user = await self.repository.update(user_id, updates, utcnow())
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return self._sanitize_user_output(user)

    async def ensure_master_admin(self) -> dict:
        email = self.settings.master_admin_email.lower()
        existing = await self.repository.get_by_email(email)

        if not existing:
            created = await self.create_user(
                UserCreate(
                    email=email,
                    full_name=self.settings.master_admin_full_name,
                    password=self.settings.master_admin_password,
                    role="admin",
                    is_active=True,
                    avatar_seed="system-admin",
                    avatar_style="adventurer-neutral",
                )
            )
            return self._sanitize_user_output(created)

        updates = {
            "role": "admin",
            "is_active": True,
        }

        if not existing.get("full_name"):
            updates["full_name"] = self.settings.master_admin_full_name
        if not existing.get("avatar_seed"):
            updates["avatar_seed"] = "system-admin"
        if not existing.get("avatar_style"):
            updates["avatar_style"] = "adventurer-neutral"

        updated = await self.repository.update(existing["id"], updates, utcnow())
        return self._sanitize_user_output(updated)

    async def get_user_with_password(self, email: str) -> dict | None:
        return await self.repository.get_by_email(email)

    async def get_user(self, user_id: str) -> dict:
        user = await self.repository.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return self._sanitize_user_output(user)

    async def update_my_profile(self, user_id: str, payload: UserProfileUpdate) -> dict:
        existing = await self.repository.get_by_id(user_id)
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        updates = payload.model_dump()
        user = await self.repository.update(user_id, updates, utcnow())
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        return self._sanitize_user_output(user)

    async def update_my_password(self, user_id: str, payload: UserPasswordUpdate) -> None:
        existing = await self.repository.get_by_id(user_id)
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        if not verify_password(payload.current_password, existing["password_hash"]):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Current password is incorrect",
            )

        if payload.current_password == payload.new_password:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="New password must be different from current password",
            )

        await self.repository.update(
            user_id,
            {"password_hash": get_password_hash(payload.new_password)},
            utcnow(),
        )
