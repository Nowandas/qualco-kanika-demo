import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.mongo_utils import utcnow
from app.core.security import hash_one_time_token
from app.domains.invitations.repository import InvitationRepository
from app.domains.invitations.schemas import InvitationCreate
from app.domains.users.repository import UserRepository
from app.domains.users.schemas import UserCreate
from app.domains.users.service import UserService


def to_aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


class InvitationService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.repository = InvitationRepository(db)
        self.user_repository = UserRepository(db)
        self.user_service = UserService(db)

    async def ensure_indexes(self) -> None:
        await self.repository.create_indexes()

    async def create_invitation(self, payload: InvitationCreate, created_by_user_id: str) -> dict:
        if await self.user_repository.get_by_email(payload.email):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")

        now = utcnow()
        raw_token = secrets.token_urlsafe(32)
        invitation = {
            "email": payload.email.lower(),
            "role": payload.role,
            "token_hash": hash_one_time_token(raw_token),
            "token_hint": f"{raw_token[:6]}...{raw_token[-4:]}",
            "expires_at": now + timedelta(hours=payload.expires_in_hours),
            "accepted_at": None,
            "created_by_user_id": created_by_user_id,
            "created_at": now,
        }
        created = await self.repository.create(invitation)
        created["token"] = raw_token
        return created

    async def list_invitations(self) -> list[dict]:
        invitations = await self.repository.list_all()
        for invitation in invitations:
            raw_token = invitation.pop("token", None)
            if not invitation.get("token_hint") and raw_token:
                invitation["token_hint"] = f"{raw_token[:6]}...{raw_token[-4:]}"
        return invitations

    async def accept_invitation(
        self,
        token: str,
        full_name: str,
        password: str,
        avatar_seed: str | None,
        avatar_style: str,
    ) -> dict:
        invitation = await self.repository.get_by_token(token)
        if not invitation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found")

        if invitation.get("accepted_at") is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invitation already used")

        expires_at = to_aware_utc(invitation["expires_at"])
        if expires_at < utcnow():
            raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invitation expired")

        user_payload = UserCreate(
            email=invitation["email"],
            full_name=full_name,
            password=password,
            role=invitation["role"],
            is_active=True,
            avatar_seed=avatar_seed,
            avatar_style=avatar_style,
        )
        user = await self.user_service.create_user(user_payload)
        marked = await self.repository.mark_accepted(invitation["id"], utcnow())
        if not marked:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Invitation already used")
        user.pop("password_hash", None)
        return user
