import pytest
from fastapi import HTTPException, status

from app.domains.hospitality.service import (
    ALLOWED_CONTRACT_EXTENSIONS,
    MAX_CONTRACT_UPLOAD_BYTES,
    HospitalityService,
)


def _service() -> HospitalityService:
    return HospitalityService.__new__(HospitalityService)


def test_contract_upload_rejects_unsupported_extension() -> None:
    service = _service()

    with pytest.raises(HTTPException) as exc:
        service._ensure_file_payload(
            file_name="payload.exe",
            content=b"binary",
            allowed_extensions=ALLOWED_CONTRACT_EXTENSIONS,
            max_bytes=MAX_CONTRACT_UPLOAD_BYTES,
            label="contract",
            empty_message="Contract file is empty",
        )

    assert exc.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "Unsupported contract file type" in str(exc.value.detail)
