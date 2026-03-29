from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import get_settings

settings = get_settings()
client = AsyncIOMotorClient(settings.mongo_uri)
database: AsyncIOMotorDatabase = client[settings.mongo_db_name]


def get_db() -> AsyncIOMotorDatabase:
    return database
