from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.mongo_utils import serialize_document


class HotelRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.hotels = db["hotels"]

    async def create_indexes(self) -> None:
        await self.hotels.create_index("code", unique=True)
        await self.hotels.create_index([("is_active", 1), ("name", 1)])
        await self.hotels.create_index([("updated_at", -1)])

    async def list_hotels(self, include_inactive: bool = True) -> list[dict]:
        query = {} if include_inactive else {"is_active": True}
        items: list[dict] = []
        async for doc in self.hotels.find(query).sort([("is_active", -1), ("name", 1)]):
            items.append(serialize_document(doc))
        return items

    async def create_hotel(self, data: dict) -> dict:
        result = await self.hotels.insert_one(data)
        created = await self.hotels.find_one({"_id": result.inserted_id})
        return serialize_document(created)

    async def get_hotel(self, hotel_id: str) -> dict | None:
        if not ObjectId.is_valid(hotel_id):
            return None
        doc = await self.hotels.find_one({"_id": ObjectId(hotel_id)})
        if not doc:
            return None
        return serialize_document(doc)

    async def get_by_code(self, code: str) -> dict | None:
        doc = await self.hotels.find_one({"code": code})
        if not doc:
            return None
        return serialize_document(doc)

    async def update_hotel(self, hotel_id: str, updates: dict) -> dict | None:
        if not ObjectId.is_valid(hotel_id):
            return None
        await self.hotels.update_one({"_id": ObjectId(hotel_id)}, {"$set": updates})
        updated = await self.hotels.find_one({"_id": ObjectId(hotel_id)})
        if not updated:
            return None
        return serialize_document(updated)
