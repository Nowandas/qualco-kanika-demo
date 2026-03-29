from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_db
from app.core.mongo_utils import utcnow
from app.domains.auth.dependencies import get_current_user, require_admin
from app.domains.password_resets.schemas import PasswordResetCreate, PasswordResetRead
from app.domains.password_resets.service import PasswordResetService
from app.domains.users.repository import UserRepository
from app.domains.users.schemas import (
    UserAvatarUpdate,
    UserPasswordUpdate,
    UserProfileUpdate,
    UserRead,
    UserUpdate,
)
from app.domains.users.service import UserService

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserRead], dependencies=[Depends(require_admin)])
async def list_users(db: AsyncIOMotorDatabase = Depends(get_db)) -> list[dict]:
    service = UserService(db)
    return await service.list_users()


@router.patch("/{user_id}", response_model=UserRead, dependencies=[Depends(require_admin)])
async def update_user(user_id: str, payload: UserUpdate, db: AsyncIOMotorDatabase = Depends(get_db)) -> dict:
    service = UserService(db)
    return await service.update_user(user_id, payload)


@router.post("/{user_id}/password-reset-link", response_model=PasswordResetRead)
async def create_password_reset_link(
    user_id: str,
    payload: PasswordResetCreate,
    admin_user: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = PasswordResetService(db)
    return await service.create_password_reset_link(
        user_id=user_id,
        payload=payload,
        created_by_user_id=admin_user["id"],
    )


@router.patch("/me/avatar", response_model=UserRead)
async def update_my_avatar(
    payload: UserAvatarUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    repository = UserRepository(db)
    updated = await repository.update(
        current_user["id"],
        {"avatar_seed": payload.avatar_seed, "avatar_style": payload.avatar_style},
        utcnow(),
    )
    updated.pop("password_hash", None)
    return updated


@router.patch("/me/profile", response_model=UserRead)
async def update_my_profile(
    payload: UserProfileUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = UserService(db)
    return await service.update_my_profile(current_user["id"], payload)


@router.patch("/me/password")
async def update_my_password(
    payload: UserPasswordUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = UserService(db)
    await service.update_my_password(current_user["id"], payload)
    return {"success": True, "message": "Password updated successfully"}
