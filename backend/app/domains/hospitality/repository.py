import re
from datetime import date, datetime, timezone

from bson import Binary, ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import UpdateOne

from app.core.mongo_utils import serialize_document


class HospitalityRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.hotels = db["hotels"]
        self.contracts = db["hospitality_contracts"]
        self.contract_files = db["hospitality_contract_files"]
        self.promotions = db["hospitality_promotions"]
        self.rules = db["hospitality_rules"]
        self.sync_runs = db["hospitality_sync_runs"]
        self.validation_runs = db["hospitality_validation_runs"]
        self.alerts = db["hospitality_alerts"]
        self.ai_extractions = db["hospitality_ai_extractions"]
        self.reconciliation_imports = db["hospitality_reconciliation_imports"]
        self.reconciliation_reservations = db["hospitality_reconciliation_reservations"]
        self.settings = db["hospitality_settings"]

    async def create_indexes(self) -> None:
        await self.contracts.create_index([("hotel_id", 1), ("created_at", -1)])
        await self.contracts.create_index([("operator_code", 1), ("hotel_code", 1), ("created_at", -1)])
        await self.contract_files.create_index([("contract_id", 1)], unique=True)
        await self.contract_files.create_index([("updated_at", -1)])
        await self.promotions.create_index([("hotel_id", 1), ("created_at", -1)])
        await self.promotions.create_index([("operator_code", 1), ("hotel_code", 1), ("created_at", -1)])
        await self.promotions.create_index([("affected_contract_ids", 1), ("created_at", -1)])
        await self.rules.create_index([("hotel_id", 1), ("priority", 1)])
        await self.rules.create_index([("contract_id", 1), ("priority", 1)])
        await self.sync_runs.create_index([("hotel_id", 1), ("created_at", -1)])
        await self.sync_runs.create_index([("contract_id", 1), ("created_at", -1)])
        await self.validation_runs.create_index([("hotel_id", 1), ("created_at", -1)])
        await self.validation_runs.create_index([("contract_id", 1), ("created_at", -1)])
        await self.alerts.create_index([("hotel_id", 1), ("status", 1), ("created_at", -1)])
        await self.alerts.create_index([("status", 1), ("created_at", -1)])
        await self.alerts.create_index([("contract_id", 1), ("status", 1), ("created_at", -1)])
        await self.ai_extractions.create_index([("created_at", -1)])
        await self.ai_extractions.create_index([("hotel_id", 1), ("created_at", -1)])
        await self.ai_extractions.create_index([("hotel_code", 1), ("operator_code", 1), ("created_at", -1)])
        await self.ai_extractions.create_index([("persisted_contract_id", 1)])
        await self.reconciliation_imports.create_index([("hotel_id", 1), ("created_at", -1)])
        await self.reconciliation_imports.create_index([("contract_id", 1), ("created_at", -1)])
        await self.reconciliation_imports.create_index([("source_system", 1), ("created_at", -1)])
        await self.reconciliation_imports.create_index([("ingestion_mode", 1), ("created_at", -1)])
        await self.reconciliation_reservations.create_index([("import_id", 1), ("stay_date", 1)])
        await self.reconciliation_reservations.create_index([("hotel_id", 1), ("stay_date", -1)])
        await self.reconciliation_reservations.create_index([("contract_id", 1), ("stay_date", -1)])
        await self.reconciliation_reservations.create_index([("contract_id", 1), ("reservation_unique_key", 1)])
        await self.reconciliation_reservations.create_index([("contract_id", 1), ("reservation_group_key", 1)])
        await self.reconciliation_reservations.create_index([("source_system", 1), ("created_at", -1)])
        await self.reconciliation_reservations.create_index([("room_type", 1), ("stay_date", -1)])
        await self.reconciliation_reservations.create_index([("created_at", -1)])
        await self.settings.create_index([("updated_at", -1)])

    async def get_upload_limits(self) -> dict | None:
        doc = await self.settings.find_one({"_id": "upload_limits"})
        if not doc:
            return None
        return serialize_document(doc)

    async def upsert_upload_limits(
        self,
        *,
        contract_mb: int,
        promotion_mb: int,
        reconciliation_mb: int,
        pricing_ai_mb: int,
        updated_at: datetime,
        updated_by_user_id: str,
    ) -> dict:
        payload = self._mongo_compatible(
            {
                "contract_mb": int(contract_mb),
                "promotion_mb": int(promotion_mb),
                "reconciliation_mb": int(reconciliation_mb),
                "pricing_ai_mb": int(pricing_ai_mb),
                "updated_at": updated_at,
                "updated_by_user_id": updated_by_user_id,
            }
        )
        await self.settings.update_one(
            {"_id": "upload_limits"},
            {
                "$set": payload,
                "$setOnInsert": {"created_at": self._mongo_compatible(updated_at)},
            },
            upsert=True,
        )
        stored = await self.settings.find_one({"_id": "upload_limits"})
        if not stored:
            raise RuntimeError("Upload limits settings could not be stored.")
        return serialize_document(stored)

    async def delete_all_contract_related_data(self) -> dict:
        contract_domain_collections = {
            "hospitality_contracts": self.contracts,
            "hospitality_contract_files": self.contract_files,
            "hospitality_promotions": self.promotions,
            "hospitality_rules": self.rules,
            "hospitality_sync_runs": self.sync_runs,
            "hospitality_validation_runs": self.validation_runs,
            "hospitality_alerts": self.alerts,
            "hospitality_ai_extractions": self.ai_extractions,
            "hospitality_reconciliation_imports": self.reconciliation_imports,
            "hospitality_reconciliation_reservations": self.reconciliation_reservations,
        }
        deleted_collections: dict[str, int] = {}
        total_deleted_documents = 0

        for name, collection in contract_domain_collections.items():
            result = await collection.delete_many({})
            deleted_count = int(result.deleted_count or 0)
            deleted_collections[name] = deleted_count
            total_deleted_documents += deleted_count

        return {
            "deleted_collections": deleted_collections,
            "total_deleted_documents": total_deleted_documents,
        }

    async def create_contract(self, data: dict) -> dict:
        result = await self.contracts.insert_one(self._mongo_compatible(data))
        created = await self.contracts.find_one({"_id": result.inserted_id})
        return serialize_document(created)

    async def set_contract_uploaded_file_flag(
        self,
        contract_id: str,
        has_uploaded_file: bool,
        updated_at: datetime,
    ) -> dict | None:
        if not ObjectId.is_valid(contract_id):
            return None
        await self.contracts.update_one(
            {"_id": ObjectId(contract_id)},
            {
                "$set": {
                    "has_uploaded_file": bool(has_uploaded_file),
                    "updated_at": updated_at,
                }
            },
        )
        updated = await self.contracts.find_one({"_id": ObjectId(contract_id)})
        if not updated:
            return None
        return serialize_document(updated)

    async def upsert_contract_file(
        self,
        *,
        contract_id: str,
        file_name: str,
        file_type: str,
        content_type: str,
        file_size: int,
        content: bytes,
        uploaded_by_user_id: str,
        updated_at: datetime,
    ) -> dict:
        set_payload = self._mongo_compatible(
            {
                "contract_id": contract_id,
                "file_name": file_name,
                "file_type": file_type,
                "content_type": content_type,
                "file_size": int(file_size),
                "content": Binary(content),
                "uploaded_by_user_id": uploaded_by_user_id,
                "updated_at": updated_at,
            }
        )
        await self.contract_files.update_one(
            {"contract_id": contract_id},
            {
                "$set": set_payload,
                "$setOnInsert": {"created_at": self._mongo_compatible(updated_at)},
            },
            upsert=True,
        )
        stored = await self.contract_files.find_one({"contract_id": contract_id})
        if not stored:
            raise RuntimeError("Contract file was not stored.")
        return serialize_document(stored)

    async def list_contracts(
        self,
        *,
        search_text: str | None = None,
        hotel_id: str | None = None,
        hotel_code: str | None = None,
        operator_code: str | None = None,
        season_label: str | None = None,
        source: str | None = None,
        sort_by: str = "created_at",
        sort_order: str = "desc",
        limit: int = 300,
    ) -> list[dict]:
        allowed_sort_fields = {
            "created_at",
            "updated_at",
            "file_name",
            "file_size",
            "hotel_code",
            "operator_code",
            "season_label",
            "source",
        }
        sort_field = sort_by if sort_by in allowed_sort_fields else "created_at"
        direction = 1 if sort_order == "asc" else -1

        query: dict = {}
        if hotel_id and hotel_id.strip():
            query["hotel_id"] = hotel_id.strip()
        if hotel_code and hotel_code.strip():
            query["hotel_code"] = hotel_code.strip().upper()
        if operator_code and operator_code.strip():
            query["operator_code"] = operator_code.strip().upper()
        if season_label and season_label.strip():
            query["season_label"] = {"$regex": f"^{re.escape(season_label.strip())}$", "$options": "i"}
        if source and source.strip():
            query["source"] = source.strip().lower()

        if search_text and search_text.strip():
            pattern = re.escape(search_text.strip())
            regex = {"$regex": pattern, "$options": "i"}
            query["$or"] = [
                {"file_name": regex},
                {"hotel_code": regex},
                {"operator_code": regex},
                {"season_label": regex},
                {"parsed_text_preview": regex},
                {"extraction.room_types": regex},
                {"extraction.seasonal_periods": regex},
                {"extraction.board_types": regex},
                {"extraction.discounts": regex},
                {"extraction.supplements": regex},
                {"extraction.marketing_contributions": regex},
                {"extraction.raw_highlights": regex},
            ]

        effective_limit = min(max(int(limit), 1), 1000)
        sort_spec = [(sort_field, direction)]
        if sort_field != "created_at":
            sort_spec.append(("created_at", -1))

        items: list[dict] = []
        cursor = self.contracts.find(query).sort(sort_spec).limit(effective_limit)
        async for doc in cursor:
            items.append(serialize_document(doc))
        return items

    async def get_contract(self, contract_id: str) -> dict | None:
        if not ObjectId.is_valid(contract_id):
            return None
        doc = await self.contracts.find_one({"_id": ObjectId(contract_id)})
        if not doc:
            return None
        return serialize_document(doc)

    async def get_contract_file(self, contract_id: str) -> dict | None:
        doc = await self.contract_files.find_one({"contract_id": contract_id})
        if not doc:
            return None
        return serialize_document(doc)

    async def create_promotion(self, data: dict) -> dict:
        result = await self.promotions.insert_one(self._mongo_compatible(data))
        created = await self.promotions.find_one({"_id": result.inserted_id})
        return serialize_document(created)

    async def list_promotions(
        self,
        hotel_id: str | None = None,
        operator_code: str | None = None,
        contract_id: str | None = None,
    ) -> list[dict]:
        items: list[dict] = []
        query: dict = {}
        if hotel_id and hotel_id.strip():
            query["hotel_id"] = hotel_id.strip()
        if operator_code and operator_code.strip():
            query["operator_code"] = operator_code.strip().upper()
        if contract_id and contract_id.strip():
            query["$or"] = [
                {"affected_contract_ids": {"$exists": False}},
                {"affected_contract_ids": []},
                {"affected_contract_ids": contract_id.strip()},
            ]
        async for doc in self.promotions.find(query).sort("created_at", -1):
            items.append(serialize_document(doc))
        return items

    async def list_promotions_for_contract(
        self,
        *,
        operator_code: str,
        hotel_code: str,
        hotel_id: str | None = None,
        contract_id: str | None = None,
    ) -> list[dict]:
        items: list[dict] = []
        query: dict = {"operator_code": operator_code}
        if hotel_id and hotel_id.strip():
            query["hotel_id"] = hotel_id.strip()
        else:
            query["hotel_code"] = hotel_code
        if contract_id and contract_id.strip():
            query["$or"] = [
                {"affected_contract_ids": {"$exists": False}},
                {"affected_contract_ids": []},
                {"affected_contract_ids": contract_id.strip()},
            ]
        cursor = self.promotions.find(query).sort("created_at", -1)
        async for doc in cursor:
            items.append(serialize_document(doc))
        return items

    async def get_hotel_by_id(self, hotel_id: str) -> dict | None:
        if not ObjectId.is_valid(hotel_id):
            return None
        doc = await self.hotels.find_one({"_id": ObjectId(hotel_id)})
        if not doc:
            return None
        return serialize_document(doc)

    async def get_hotel_by_code(self, code: str) -> dict | None:
        doc = await self.hotels.find_one({"code": code})
        if not doc:
            return None
        return serialize_document(doc)

    async def get_contracts_by_ids(self, contract_ids: list[str]) -> list[dict]:
        object_ids = [ObjectId(contract_id) for contract_id in contract_ids if ObjectId.is_valid(contract_id)]
        if not object_ids:
            return []
        items: list[dict] = []
        cursor = self.contracts.find({"_id": {"$in": object_ids}})
        async for doc in cursor:
            items.append(serialize_document(doc))
        return items

    async def replace_rules(self, contract_id: str, rules: list[dict]) -> list[dict]:
        await self.rules.delete_many({"contract_id": contract_id})
        if not rules:
            return []
        await self.rules.insert_many([self._mongo_compatible(item) for item in rules])
        return await self.list_rules(contract_id)

    async def list_rules(self, contract_id: str | None = None) -> list[dict]:
        query = {"contract_id": contract_id} if contract_id else {}
        items: list[dict] = []
        async for doc in self.rules.find(query).sort([("contract_id", 1), ("priority", 1), ("created_at", 1)]):
            items.append(serialize_document(doc))
        return items

    async def create_sync_run(self, data: dict) -> dict:
        result = await self.sync_runs.insert_one(self._mongo_compatible(data))
        created = await self.sync_runs.find_one({"_id": result.inserted_id})
        return serialize_document(created)

    async def list_sync_runs(
        self,
        contract_id: str | None = None,
        hotel_id: str | None = None,
        limit: int = 100,
    ) -> list[dict]:
        query: dict = {}
        if contract_id and contract_id.strip():
            query["contract_id"] = contract_id.strip()
        if hotel_id and hotel_id.strip():
            query["hotel_id"] = hotel_id.strip()
        items: list[dict] = []
        async for doc in self.sync_runs.find(query).sort("created_at", -1).limit(limit):
            items.append(serialize_document(doc))
        return items

    async def create_validation_run(self, data: dict) -> dict:
        result = await self.validation_runs.insert_one(self._mongo_compatible(data))
        created = await self.validation_runs.find_one({"_id": result.inserted_id})
        return serialize_document(created)

    async def list_validation_runs(
        self,
        contract_id: str | None = None,
        hotel_id: str | None = None,
        limit: int = 200,
    ) -> list[dict]:
        query: dict = {}
        if contract_id and contract_id.strip():
            query["contract_id"] = contract_id.strip()
        if hotel_id and hotel_id.strip():
            query["hotel_id"] = hotel_id.strip()
        items: list[dict] = []
        async for doc in self.validation_runs.find(query).sort("created_at", -1).limit(limit):
            items.append(serialize_document(doc))
        return items

    async def create_alert(self, data: dict) -> dict:
        result = await self.alerts.insert_one(self._mongo_compatible(data))
        created = await self.alerts.find_one({"_id": result.inserted_id})
        return serialize_document(created)

    async def create_ai_extraction(self, data: dict) -> dict:
        result = await self.ai_extractions.insert_one(self._mongo_compatible(data))
        created = await self.ai_extractions.find_one({"_id": result.inserted_id})
        return serialize_document(created)

    async def create_reconciliation_import(self, import_data: dict, reservation_lines: list[dict]) -> dict:
        result = await self.reconciliation_imports.insert_one(self._mongo_compatible(import_data))
        import_id = str(result.inserted_id)

        if reservation_lines:
            operations: list[UpdateOne] = []
            cleanup_by_contract: dict[str, dict[str, set[str]]] = {}
            for line in reservation_lines:
                enriched = dict(line)
                enriched["import_id"] = import_id
                unique_key = str(enriched.get("reservation_unique_key") or "").strip()
                contract_id = str(enriched.get("contract_id") or "").strip()
                reservation_id = str(enriched.get("reservation_id") or "").strip()
                if not unique_key or not contract_id:
                    continue

                created_at = enriched.get("created_at")
                if not isinstance(created_at, datetime):
                    created_at = datetime.now(timezone.utc)
                enriched.setdefault("updated_at", import_data.get("created_at") or created_at)
                enriched.pop("created_at", None)

                set_payload = self._mongo_compatible(enriched)
                set_on_insert = {"created_at": self._mongo_compatible(created_at)}

                contract_cleanup = cleanup_by_contract.setdefault(contract_id, {"unique_keys": set(), "reservation_ids": set()})
                contract_cleanup["unique_keys"].add(unique_key)
                if reservation_id:
                    contract_cleanup["reservation_ids"].add(reservation_id)

                operations.append(
                    UpdateOne(
                        {"contract_id": contract_id, "reservation_unique_key": unique_key},
                        {"$set": set_payload, "$setOnInsert": set_on_insert},
                        upsert=True,
                    )
                )
            if operations:
                for contract_id, cleanup in cleanup_by_contract.items():
                    unique_keys = sorted(cleanup["unique_keys"])
                    reservation_ids = sorted(cleanup["reservation_ids"])
                    if not unique_keys and not reservation_ids:
                        continue
                    clauses: list[dict] = []
                    if unique_keys:
                        clauses.append({"reservation_unique_key": {"$in": unique_keys}})
                    if reservation_ids:
                        clauses.append({"reservation_id": {"$in": reservation_ids}})
                    await self.reconciliation_reservations.delete_many(
                        {
                            "contract_id": contract_id,
                            "$or": clauses,
                        }
                    )
                await self.reconciliation_reservations.bulk_write(operations, ordered=False)

        created = await self.reconciliation_imports.find_one({"_id": result.inserted_id})
        return serialize_document(created)

    async def create_reconciliation_import_append(self, import_data: dict, reservation_lines: list[dict]) -> dict:
        result = await self.reconciliation_imports.insert_one(self._mongo_compatible(import_data))
        import_id = str(result.inserted_id)

        if reservation_lines:
            documents = []
            for line in reservation_lines:
                enriched = dict(line)
                enriched["import_id"] = import_id
                created_at = enriched.get("created_at")
                if not isinstance(created_at, datetime):
                    created_at = datetime.now(timezone.utc)
                enriched.setdefault("updated_at", import_data.get("created_at") or created_at)
                enriched.setdefault("created_at", created_at)
                documents.append(self._mongo_compatible(enriched))
            if documents:
                await self.reconciliation_reservations.insert_many(documents, ordered=False)

        created = await self.reconciliation_imports.find_one({"_id": result.inserted_id})
        return serialize_document(created)

    async def list_reconciliation_imports(
        self,
        *,
        contract_id: str | None = None,
        hotel_id: str | None = None,
        source_system: str | None = None,
        limit: int = 500,
    ) -> list[dict]:
        query: dict = {}
        if contract_id and contract_id.strip():
            query["contract_id"] = contract_id.strip()
        if hotel_id and hotel_id.strip():
            query["hotel_id"] = hotel_id.strip()
        if source_system and source_system.strip():
            query["source_system"] = source_system.strip()

        capped_limit = max(1, min(limit, 2000))
        items: list[dict] = []
        async for doc in self.reconciliation_imports.find(query).sort("created_at", -1).limit(capped_limit):
            items.append(serialize_document(doc))
        return items

    async def list_reconciliation_reservations(
        self,
        *,
        contract_id: str | None = None,
        hotel_id: str | None = None,
        import_id: str | None = None,
        room_type: str | None = None,
        board_type: str | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        source_system: str | None = None,
        search_text: str | None = None,
        sort_by: str = "stay_date",
        sort_order: str = "desc",
        limit: int = 500,
        offset: int = 0,
    ) -> dict:
        allowed_sort_fields = {"stay_date", "actual_price", "room_type", "reservation_id", "created_at"}
        sort_field = sort_by if sort_by in allowed_sort_fields else "stay_date"
        direction = 1 if sort_order == "asc" else -1

        query: dict = {}
        if contract_id and contract_id.strip():
            query["contract_id"] = contract_id.strip()
        if hotel_id and hotel_id.strip():
            query["hotel_id"] = hotel_id.strip()
        if import_id and import_id.strip():
            query["import_id"] = import_id.strip()
        if room_type and room_type.strip():
            query["room_type"] = {"$regex": f"^{re.escape(room_type.strip())}$", "$options": "i"}
        if board_type and board_type.strip():
            query["board_type"] = {"$regex": f"^{re.escape(board_type.strip())}$", "$options": "i"}
        if source_system and source_system.strip():
            query["source_system"] = source_system.strip()

        date_query: dict = {}
        if start_date:
            date_query["$gte"] = datetime(start_date.year, start_date.month, start_date.day, tzinfo=timezone.utc)
        if end_date:
            date_query["$lte"] = datetime(end_date.year, end_date.month, end_date.day, tzinfo=timezone.utc)
        if date_query:
            query["stay_date"] = date_query

        if search_text and search_text.strip():
            pattern = re.escape(search_text.strip())
            regex = {"$regex": pattern, "$options": "i"}
            query["$or"] = [
                {"reservation_id": regex},
                {"room_type": regex},
                {"board_type": regex},
                {"hotel_code": regex},
                {"operator_code": regex},
                {"file_name": regex},
                {"promo_code": regex},
            ]

        effective_limit = min(max(int(limit), 1), 1000)
        effective_offset = max(int(offset), 0)
        total = await self.reconciliation_reservations.count_documents(query)

        items: list[dict] = []
        cursor = (
            self.reconciliation_reservations.find(query)
            .sort([(sort_field, direction), ("created_at", -1)])
            .skip(effective_offset)
            .limit(effective_limit)
        )
        async for doc in cursor:
            items.append(serialize_document(doc))
        return {"total": total, "items": items}

    async def delete_reconciliation_reservation(self, reservation_row_id: str) -> dict | None:
        if not ObjectId.is_valid(reservation_row_id):
            return None
        object_id = ObjectId(reservation_row_id)
        existing = await self.reconciliation_reservations.find_one({"_id": object_id})
        if not existing:
            return None

        import_id = str(existing.get("import_id") or "").strip() or None
        result = await self.reconciliation_reservations.delete_one({"_id": object_id})
        deleted = bool(result.deleted_count)

        remaining_import_rows: int | None = None
        if deleted and import_id:
            remaining_import_rows = await self.reconciliation_reservations.count_documents({"import_id": import_id})
            if ObjectId.is_valid(import_id):
                await self.reconciliation_imports.update_one(
                    {"_id": ObjectId(import_id)},
                    {
                        "$set": {
                            "line_count": int(remaining_import_rows),
                            "updated_at": datetime.now(timezone.utc),
                        }
                    },
                )

        return {
            "deleted": deleted,
            "reservation_row_id": reservation_row_id,
            "import_id": import_id,
            "remaining_import_rows": remaining_import_rows,
        }

    async def delete_reconciliation_reservations(
        self,
        *,
        contract_id: str,
        hotel_id: str | None = None,
        import_id: str | None = None,
        room_type: str | None = None,
        board_type: str | None = None,
        source_system: str | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        search_text: str | None = None,
    ) -> dict:
        query: dict = {"contract_id": contract_id.strip()}
        if hotel_id and hotel_id.strip():
            query["hotel_id"] = hotel_id.strip()
        if import_id and import_id.strip():
            query["import_id"] = import_id.strip()
        if room_type and room_type.strip():
            query["room_type"] = {"$regex": f"^{re.escape(room_type.strip())}$", "$options": "i"}
        if board_type and board_type.strip():
            query["board_type"] = {"$regex": f"^{re.escape(board_type.strip())}$", "$options": "i"}
        if source_system and source_system.strip():
            query["source_system"] = source_system.strip()

        date_query: dict = {}
        if start_date:
            date_query["$gte"] = datetime(start_date.year, start_date.month, start_date.day, tzinfo=timezone.utc)
        if end_date:
            date_query["$lte"] = datetime(end_date.year, end_date.month, end_date.day, tzinfo=timezone.utc)
        if date_query:
            query["stay_date"] = date_query

        if search_text and search_text.strip():
            pattern = re.escape(search_text.strip())
            regex = {"$regex": pattern, "$options": "i"}
            query["$or"] = [
                {"reservation_id": regex},
                {"room_type": regex},
                {"board_type": regex},
                {"hotel_code": regex},
                {"operator_code": regex},
                {"file_name": regex},
                {"promo_code": regex},
            ]

        affected_import_ids: set[str] = set()
        cursor = self.reconciliation_reservations.find(query, {"import_id": 1})
        async for doc in cursor:
            import_value = str(doc.get("import_id") or "").strip()
            if import_value:
                affected_import_ids.add(import_value)

        result = await self.reconciliation_reservations.delete_many(query)
        deleted_count = int(result.deleted_count or 0)
        remaining_imports_updated = 0
        if deleted_count > 0:
            for import_value in sorted(affected_import_ids):
                remaining = await self.reconciliation_reservations.count_documents({"import_id": import_value})
                if ObjectId.is_valid(import_value):
                    await self.reconciliation_imports.update_one(
                        {"_id": ObjectId(import_value)},
                        {
                            "$set": {
                                "line_count": int(remaining),
                                "updated_at": datetime.now(timezone.utc),
                            }
                        },
                    )
                    remaining_imports_updated += 1

        return {
            "deleted": deleted_count > 0,
            "deleted_count": deleted_count,
            "contract_id": contract_id.strip(),
            "hotel_id": hotel_id.strip() if hotel_id and hotel_id.strip() else None,
            "import_id": import_id.strip() if import_id and import_id.strip() else None,
            "remaining_imports_updated": remaining_imports_updated,
        }

    async def get_ai_extraction(self, extraction_id: str) -> dict | None:
        if not ObjectId.is_valid(extraction_id):
            return None
        doc = await self.ai_extractions.find_one({"_id": ObjectId(extraction_id)})
        if not doc:
            return None
        return serialize_document(doc)

    async def mark_ai_extraction_persisted(
        self,
        extraction_id: str,
        contract_id: str,
        persisted_at: datetime,
        persisted_by_user_id: str,
    ) -> dict | None:
        if not ObjectId.is_valid(extraction_id):
            return None
        await self.ai_extractions.update_one(
            {"_id": ObjectId(extraction_id)},
            {
                "$set": {
                    "persisted_contract_id": contract_id,
                    "persisted_at": persisted_at,
                    "persisted_by_user_id": persisted_by_user_id,
                }
            },
        )
        updated = await self.ai_extractions.find_one({"_id": ObjectId(extraction_id)})
        if not updated:
            return None
        return serialize_document(updated)

    async def list_alerts(self, status: str | None = None, hotel_id: str | None = None, limit: int = 300) -> list[dict]:
        query: dict = {}
        if status and status.strip():
            query["status"] = status.strip()
        if hotel_id and hotel_id.strip():
            query["hotel_id"] = hotel_id.strip()
        items: list[dict] = []
        async for doc in self.alerts.find(query).sort("created_at", -1).limit(limit):
            items.append(serialize_document(doc))
        return items

    async def resolve_alert(
        self,
        alert_id: str,
        resolved_at: datetime,
        resolved_by_user_id: str,
        resolution_note: str,
    ) -> dict | None:
        if not ObjectId.is_valid(alert_id):
            return None

        await self.alerts.update_one(
            {"_id": ObjectId(alert_id)},
            {
                "$set": {
                    "status": "resolved",
                    "resolved_at": resolved_at,
                    "resolved_by_user_id": resolved_by_user_id,
                    "resolution_note": resolution_note,
                }
            },
        )
        updated = await self.alerts.find_one({"_id": ObjectId(alert_id)})
        if not updated:
            return None
        return serialize_document(updated)

    async def stats_overview(self, hotel_id: str | None = None) -> dict:
        hotel_query = {"hotel_id": hotel_id.strip()} if hotel_id and hotel_id.strip() else {}

        contract_count = await self.contracts.count_documents(hotel_query)
        promotion_count = await self.promotions.count_documents(hotel_query)
        rules_count = await self.rules.count_documents(hotel_query)
        sync_runs_count = await self.sync_runs.count_documents(hotel_query)
        validation_runs_count = await self.validation_runs.count_documents(hotel_query)
        open_alerts_query = {"status": "open", **hotel_query}
        open_alerts_count = await self.alerts.count_documents(open_alerts_query)

        mismatch_lines = 0
        total_lines = 0
        async for run in self.validation_runs.find(hotel_query, {"match_count": 1, "mismatch_count": 1}):
            mismatch_lines += int(run.get("mismatch_count", 0))
            total_lines += int(run.get("match_count", 0)) + int(run.get("mismatch_count", 0))

        mismatch_rate = (mismatch_lines / total_lines * 100.0) if total_lines else 0.0

        return {
            "contract_count": contract_count,
            "promotion_count": promotion_count,
            "rules_count": rules_count,
            "sync_runs_count": sync_runs_count,
            "validation_runs_count": validation_runs_count,
            "open_alerts_count": open_alerts_count,
            "mismatch_rate": round(mismatch_rate, 2),
        }

    def _mongo_compatible(self, value: object) -> object:
        if isinstance(value, datetime):
            if value.tzinfo is None:
                return value.replace(tzinfo=timezone.utc)
            return value.astimezone(timezone.utc)
        if isinstance(value, date):
            return datetime(value.year, value.month, value.day, tzinfo=timezone.utc)
        if isinstance(value, dict):
            return {str(key): self._mongo_compatible(item) for key, item in value.items()}
        if isinstance(value, (list, tuple, set)):
            return [self._mongo_compatible(item) for item in value]
        return value
