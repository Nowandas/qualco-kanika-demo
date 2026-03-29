from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import OperationFailure

from app.core.mongo_utils import serialize_document
from app.core.security import hash_one_time_token


class InvitationRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.collection = db["invitations"]

    async def create_indexes(self) -> None:
        await self.collection.create_index("email")
        try:
            await self.collection.drop_index("token_1")
        except OperationFailure:
            pass
        await self.collection.create_index("token_hash", unique=True, sparse=True)
        await self.collection.create_index("created_at")

    async def create(self, data: dict) -> dict:
        result = await self.collection.insert_one(data)
        created = await self.collection.find_one({"_id": result.inserted_id})
        return serialize_document(created)

    async def list_all(self) -> list[dict]:
        invitations: list[dict] = []
        async for invite in self.collection.find().sort("created_at", -1):
            invitations.append(serialize_document(invite))
        return invitations

    async def get_by_token(self, token: str) -> dict | None:
        token_hash = hash_one_time_token(token)
        invitation = await self.collection.find_one({"token_hash": token_hash})
        if not invitation:
            invitation = await self.collection.find_one({"token": token})
            if invitation and not invitation.get("token_hash"):
                await self.collection.update_one(
                    {"_id": invitation["_id"], "token_hash": {"$exists": False}},
                    {"$set": {"token_hash": token_hash}, "$unset": {"token": ""}},
                )
                invitation["token_hash"] = token_hash
                invitation.pop("token", None)
        if not invitation:
            return None
        return serialize_document(invitation)

    async def mark_accepted(self, invitation_id: str, accepted_at) -> bool:
        if not ObjectId.is_valid(invitation_id):
            return False
        result = await self.collection.update_one(
            {"_id": ObjectId(invitation_id), "accepted_at": None},
            {"$set": {"accepted_at": accepted_at}},
        )
        return result.modified_count == 1
