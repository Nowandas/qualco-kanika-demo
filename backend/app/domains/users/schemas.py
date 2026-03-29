from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

UserRole = Literal["admin", "staff", "member"]


class UserBase(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    role: UserRole = "member"
    is_active: bool = True
    avatar_seed: str | None = None
    avatar_style: str = "adventurer-neutral"


class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    role: UserRole | None = None
    is_active: bool | None = None
    avatar_seed: str | None = None
    avatar_style: str | None = None


class UserAvatarUpdate(BaseModel):
    avatar_seed: str = Field(min_length=2, max_length=100)
    avatar_style: str = Field(default="adventurer-neutral", min_length=2, max_length=100)


class UserProfileUpdate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    avatar_seed: str = Field(min_length=2, max_length=100)
    avatar_style: str = Field(default="adventurer-neutral", min_length=2, max_length=100)


class UserPasswordUpdate(BaseModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class UserRead(UserBase):
    id: str
    created_at: datetime
    updated_at: datetime


class UserReadWithFlags(UserRead):
    password_hash: str
