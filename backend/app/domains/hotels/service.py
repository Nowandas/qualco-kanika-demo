from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.mongo_utils import utcnow
from app.domains.hotels.repository import HotelRepository
from app.domains.hotels.schemas import HotelCreate, HotelUpdate


class HotelService:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.repository = HotelRepository(db)

    async def ensure_indexes(self) -> None:
        await self.repository.create_indexes()

    async def list_hotels(self, include_inactive: bool = True) -> list[dict]:
        return await self.repository.list_hotels(include_inactive=include_inactive)

    async def create_hotel(self, payload: HotelCreate) -> dict:
        now = utcnow()
        code = payload.code.strip().upper()
        name = payload.name.strip()
        if not code:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Hotel code is required.")
        if not name:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Hotel name is required.")

        existing = await self.repository.get_by_code(code)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Hotel with code '{code}' already exists.",
            )

        document = {
            "code": code,
            "name": name,
            "is_active": bool(payload.is_active),
            "created_at": now,
            "updated_at": now,
        }
        return await self.repository.create_hotel(document)

    async def update_hotel(self, hotel_id: str, payload: HotelUpdate) -> dict:
        existing = await self.repository.get_hotel(hotel_id)
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hotel not found.")

        updates: dict = {"updated_at": utcnow()}
        if payload.code is not None:
            new_code = payload.code.strip().upper()
            if not new_code:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Hotel code is invalid.")
            duplicate = await self.repository.get_by_code(new_code)
            if duplicate and duplicate["id"] != existing["id"]:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Hotel with code '{new_code}' already exists.",
                )
            updates["code"] = new_code
        if payload.name is not None:
            trimmed_name = payload.name.strip()
            if not trimmed_name:
                raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Hotel name is invalid.")
            updates["name"] = trimmed_name
        if payload.is_active is not None:
            updates["is_active"] = bool(payload.is_active)

        updated = await self.repository.update_hotel(hotel_id=hotel_id, updates=updates)
        if not updated:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hotel not found.")
        return updated
