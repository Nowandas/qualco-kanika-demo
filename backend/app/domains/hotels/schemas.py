from datetime import datetime

from pydantic import BaseModel, Field


class HotelRead(BaseModel):
    id: str
    code: str
    name: str
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class HotelCreate(BaseModel):
    code: str = Field(min_length=2, max_length=20)
    name: str = Field(min_length=2, max_length=140)
    is_active: bool = True


class HotelUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=2, max_length=20)
    name: str | None = Field(default=None, min_length=2, max_length=140)
    is_active: bool | None = None
