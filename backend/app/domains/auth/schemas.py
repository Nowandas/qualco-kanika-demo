from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LogoutResponse(BaseModel):
    success: bool = True


class InvitationAcceptRequest(BaseModel):
    token: str = Field(min_length=12)
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=128)
    avatar_seed: str | None = None
    avatar_style: str = "adventurer-neutral"
