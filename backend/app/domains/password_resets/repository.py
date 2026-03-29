from datetime import datetime

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import OperationFailure

from app.core.mongo_utils import serialize_document
from app.core.security import hash_one_time_token


class PasswordResetRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.collection = db["password_resets"]

    async def create_indexes(self) -> None:
        try:
            await self.collection.drop_index("token_1")
        except OperationFailure:
            pass
        await self.collection.create_index("token_hash", unique=True, sparse=True)
        await self.collection.create_index("user_id")
        await self.collection.create_index("created_at")

    async def create(self, data: dict) -> dict:
        result = await self.collection.insert_one(data)
        created = await self.collection.find_one({"_id": result.inserted_id})
        return serialize_document(created)

    async def get_by_token(self, token: str) -> dict | None:
        token_hash = hash_one_time_token(token)
        reset = await self.collection.find_one({"token_hash": token_hash})
        if not reset:
            reset = await self.collection.find_one({"token": token})
            if reset and not reset.get("token_hash"):
                await self.collection.update_one(
                    {"_id": reset["_id"], "token_hash": {"$exists": False}},
                    {"$set": {"token_hash": token_hash}, "$unset": {"token": ""}},
                )
                reset["token_hash"] = token_hash
                reset.pop("token", None)

        if not reset:
            return None
        return serialize_document(reset)

    async def revoke_active_for_user(self, user_id: str, revoked_at: datetime) -> None:
        await self.collection.update_many(
            {
                "user_id": user_id,
                "consumed_at": None,
                "revoked_at": None,
            },
            {"$set": {"revoked_at": revoked_at}},
        )

    async def mark_consumed(self, reset_id: str, consumed_at: datetime) -> bool:
        if not ObjectId.is_valid(reset_id):
            return False
        result = await self.collection.update_one(
            {
                "_id": ObjectId(reset_id),
                "consumed_at": None,
                "revoked_at": None,
            },
            {"$set": {"consumed_at": consumed_at}},
        )
        return result.modified_count == 1
