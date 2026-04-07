from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

InvitationRole = Literal["admin", "staff", "member"]


class InvitationCreate(BaseModel):
    email: EmailStr
    role: InvitationRole = "member"
    expires_in_hours: int = Field(default=72, ge=1, le=720)


class InvitationRead(BaseModel):
    id: str
    email: EmailStr
    role: InvitationRole
    token_hint: str | None = None
    expires_at: datetime
    accepted_at: datetime | None = None
    created_by_user_id: str
    created_at: datetime


class InvitationCreateResponse(InvitationRead):
    token: str


class InvitationTokenIssueResponse(InvitationRead):
    token: str
    issued_at: datetime
