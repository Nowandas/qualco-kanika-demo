from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import LOCAL_ENVS, get_settings
from app.core.database import get_db
from app.domains.auth.router import router as auth_router
from app.domains.hotels.router import router as hotels_router
from app.domains.hotels.service import HotelService
from app.domains.hospitality.router import router as hospitality_router
from app.domains.hospitality.service import HospitalityService
from app.domains.invitations.router import router as invitations_router
from app.domains.invitations.service import InvitationService
from app.domains.password_resets.service import PasswordResetService
from app.domains.users.router import router as users_router
from app.domains.users.service import UserService

settings = get_settings()


async def bootstrap_system() -> None:
    db = get_db()

    user_service = UserService(db)
    invitation_service = InvitationService(db)
    password_reset_service = PasswordResetService(db)
    hotel_service = HotelService(db)
    hospitality_service = HospitalityService(db)

    await user_service.ensure_indexes()
    await invitation_service.ensure_indexes()
    await password_reset_service.ensure_indexes()
    await hotel_service.ensure_indexes()
    await hospitality_service.ensure_indexes()

    await user_service.ensure_master_admin()


@asynccontextmanager
async def lifespan(_: FastAPI):
    await bootstrap_system()
    yield


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)


@app.middleware("http")
async def reject_range_requests(request: Request, call_next):
    # Temporary mitigation while upstream Starlette range-parser hardening is pending in our dependency chain.
    if request.headers.get("range"):
        return JSONResponse(
            status_code=416,
            content={"detail": "Range requests are disabled for this API."},
        )
    return await call_next(request)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)

    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

    app_env = settings.app_env.strip().lower()
    if app_env not in LOCAL_ENVS:
        forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",", maxsplit=1)[0].strip().lower()
        if request.url.scheme == "https" or forwarded_proto == "https":
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=63072000; includeSubDomains; preload",
            )

    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins_list,
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=settings.cors_allow_methods_list,
    allow_headers=settings.cors_allow_headers_list,
    expose_headers=settings.cors_expose_headers_list,
)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


api_prefix = "/api/v1"
app.include_router(auth_router, prefix=api_prefix)
app.include_router(users_router, prefix=api_prefix)
app.include_router(invitations_router, prefix=api_prefix)
app.include_router(hotels_router, prefix=api_prefix)
app.include_router(hospitality_router, prefix=api_prefix)
