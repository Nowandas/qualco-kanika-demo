from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_db
from app.domains.auth.dependencies import require_admin
from app.domains.invitations.schemas import InvitationCreate, InvitationCreateResponse, InvitationRead
from app.domains.invitations.service import InvitationService

router = APIRouter(prefix="/invitations", tags=["invitations"])


@router.get("", response_model=list[InvitationRead], dependencies=[Depends(require_admin)])
async def list_invitations(db: AsyncIOMotorDatabase = Depends(get_db)) -> list[dict]:
    service = InvitationService(db)
    return await service.list_invitations()


@router.post("", response_model=InvitationCreateResponse)
async def create_invitation(
    payload: InvitationCreate,
    admin_user: dict = Depends(require_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = InvitationService(db)
    return await service.create_invitation(payload, created_by_user_id=admin_user["id"])
