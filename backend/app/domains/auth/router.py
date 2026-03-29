from fastapi import APIRouter, Depends, Request, Response
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import (
    clear_auth_cookie,
    clear_csrf_cookie,
    create_access_token,
    create_csrf_token,
    set_auth_cookie,
    set_csrf_cookie,
)
from app.domains.auth.dependencies import enforce_auth_rate_limit, get_current_user, resolve_access_token
from app.domains.auth.schemas import InvitationAcceptRequest, LoginRequest, LogoutResponse, TokenResponse
from app.domains.auth.service import AuthService
from app.domains.invitations.service import InvitationService
from app.domains.password_resets.schemas import (
    PasswordResetConsumeRequest,
    PasswordResetConsumeResponse,
    PasswordResetTokenRead,
)
from app.domains.password_resets.service import PasswordResetService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    response: Response,
    _: None = Depends(enforce_auth_rate_limit),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> TokenResponse:
    service = AuthService(db)
    user = await service.authenticate(payload.email, payload.password)
    token = create_access_token(user["id"], extra={"role": user["role"]})
    set_auth_cookie(response, token)
    set_csrf_cookie(response, create_csrf_token())
    return TokenResponse(access_token=token)


@router.post("/logout", response_model=LogoutResponse)
async def logout(response: Response, _: str = Depends(resolve_access_token)) -> LogoutResponse:
    clear_auth_cookie(response)
    clear_csrf_cookie(response)
    return LogoutResponse(success=True)


@router.get("/me")
async def me(
    request: Request,
    response: Response,
    current_user: dict = Depends(get_current_user),
) -> dict:
    settings = get_settings()
    if not request.cookies.get(settings.csrf_cookie_name):
        set_csrf_cookie(response, create_csrf_token())
    return current_user


@router.post("/accept-invitation")
async def accept_invitation(
    payload: InvitationAcceptRequest,
    response: Response,
    _: None = Depends(enforce_auth_rate_limit),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = InvitationService(db)
    user = await service.accept_invitation(
        token=payload.token,
        full_name=payload.full_name,
        password=payload.password,
        avatar_seed=payload.avatar_seed,
        avatar_style=payload.avatar_style,
    )
    token = create_access_token(user["id"], extra={"role": user["role"]})
    set_auth_cookie(response, token)
    set_csrf_cookie(response, create_csrf_token())
    return {"user": user, "access_token": token, "token_type": "bearer"}


@router.get("/password-reset/{token}", response_model=PasswordResetTokenRead)
async def get_password_reset_context(
    token: str,
    _: None = Depends(enforce_auth_rate_limit),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    service = PasswordResetService(db)
    return await service.get_reset_context(token)


@router.post("/password-reset", response_model=PasswordResetConsumeResponse)
async def consume_password_reset(
    payload: PasswordResetConsumeRequest,
    _: None = Depends(enforce_auth_rate_limit),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> PasswordResetConsumeResponse:
    service = PasswordResetService(db)
    await service.consume_reset(payload.token, payload.new_password)
    return PasswordResetConsumeResponse()
