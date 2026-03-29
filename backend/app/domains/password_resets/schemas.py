from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class PasswordResetCreate(BaseModel):
    expires_in_hours: int = Field(default=24, ge=1, le=720)


class PasswordResetRead(BaseModel):
    id: str
    user_id: str
    user_email: EmailStr
    user_full_name: str
    token: str
    expires_at: datetime
    consumed_at: datetime | None = None
    revoked_at: datetime | None = None
    created_by_user_id: str
    created_at: datetime


class PasswordResetTokenRead(BaseModel):
    user_id: str
    user_email: EmailStr
    user_full_name: str
    expires_at: datetime


class PasswordResetConsumeRequest(BaseModel):
    token: str = Field(min_length=12)
    new_password: str = Field(min_length=8, max_length=128)


class PasswordResetConsumeResponse(BaseModel):
    success: bool = True
    message: str = "Password updated successfully"
