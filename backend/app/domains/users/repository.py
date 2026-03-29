from datetime import datetime

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.mongo_utils import serialize_document


class UserRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.collection = db["users"]

    async def create_indexes(self) -> None:
        await self.collection.create_index("email", unique=True)

    async def create(self, data: dict) -> dict:
        result = await self.collection.insert_one(data)
        created = await self.collection.find_one({"_id": result.inserted_id})
        return serialize_document(created)

    async def get_by_email(self, email: str) -> dict | None:
        user = await self.collection.find_one({"email": email.lower()})
        if not user:
            return None
        return serialize_document(user)

    async def get_by_id(self, user_id: str) -> dict | None:
        if not ObjectId.is_valid(user_id):
            return None
        user = await self.collection.find_one({"_id": ObjectId(user_id)})
        if not user:
            return None
        return serialize_document(user)

    async def list_all(self) -> list[dict]:
        users: list[dict] = []
        async for user in self.collection.find().sort("created_at", -1):
            users.append(serialize_document(user))
        return users

    async def update(self, user_id: str, updates: dict, now: datetime) -> dict | None:
        if not ObjectId.is_valid(user_id):
            return None
        updates["updated_at"] = now
        await self.collection.update_one({"_id": ObjectId(user_id)}, {"$set": updates})
        updated = await self.collection.find_one({"_id": ObjectId(user_id)})
        if not updated:
            return None
        return serialize_document(updated)
