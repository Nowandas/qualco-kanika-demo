from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.database import get_db
from app.domains.auth.dependencies import require_admin
from app.domains.hotels.schemas import HotelCreate, HotelRead, HotelUpdate
from app.domains.hotels.service import HotelService

router = APIRouter(prefix="/hotels", tags=["hotels"])


@router.get("", response_model=list[HotelRead], dependencies=[Depends(require_admin)])
async def list_hotels(
    include_inactive: bool = Query(default=True),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[dict]:
    service = HotelService(db)
    return await service.list_hotels(include_inactive=include_inactive)


@router.post("", response_model=HotelRead, dependencies=[Depends(require_admin)])
async def create_hotel(payload: HotelCreate, db: AsyncIOMotorDatabase = Depends(get_db)) -> dict:
    service = HotelService(db)
    return await service.create_hotel(payload)


@router.patch("/{hotel_id}", response_model=HotelRead, dependencies=[Depends(require_admin)])
async def update_hotel(hotel_id: str, payload: HotelUpdate, db: AsyncIOMotorDatabase = Depends(get_db)) -> dict:
    service = HotelService(db)
    return await service.update_hotel(hotel_id=hotel_id, payload=payload)
