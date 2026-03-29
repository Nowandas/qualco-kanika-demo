import pytest
from fastapi import HTTPException, status

from app.domains.hospitality.service import (
    ALLOWED_CONTRACT_EXTENSIONS,
    MAX_CONTRACT_UPLOAD_BYTES,
    HospitalityService,
)


def _service() -> HospitalityService:
    return HospitalityService.__new__(HospitalityService)


def test_contract_upload_rejects_oversized_payload() -> None:
    service = _service()
    oversized = b"x" * (MAX_CONTRACT_UPLOAD_BYTES + 1)

    with pytest.raises(HTTPException) as exc:
        service._ensure_file_payload(
            file_name="contract.pdf",
            content=oversized,
            allowed_extensions=ALLOWED_CONTRACT_EXTENSIONS,
            max_bytes=MAX_CONTRACT_UPLOAD_BYTES,
            label="contract",
            empty_message="Contract file is empty",
        )

    assert exc.value.status_code == status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
    assert "Maximum allowed size" in str(exc.value.detail)


def test_contract_upload_normalizes_file_name() -> None:
    service = _service()

    normalized = service._ensure_file_payload(
        file_name="../../sensitive/path/contract.pdf",
        content=b"valid-content",
        allowed_extensions=ALLOWED_CONTRACT_EXTENSIONS,
        max_bytes=MAX_CONTRACT_UPLOAD_BYTES,
        label="contract",
        empty_message="Contract file is empty",
    )

    assert normalized == "contract.pdf"
