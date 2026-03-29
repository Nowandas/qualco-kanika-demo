import pytest
from fastapi import HTTPException, status

from app.domains.hospitality.service import HospitalityService


def _service_with_fixed_reference(reference: str) -> HospitalityService:
    service = HospitalityService.__new__(HospitalityService)
    service._log_internal_error = lambda **_: reference
    return service


def test_sanitized_http_error_hides_exception_details() -> None:
    service = _service_with_fixed_reference("ref-123456")

    with pytest.raises(HTTPException) as exc:
        service._raise_sanitized_http_error(
            status_code=status.HTTP_502_BAD_GATEWAY,
            user_message="Upstream AI provider request failed.",
            event="openai.test",
            exc=RuntimeError("sensitive-token-value"),
        )

    assert exc.value.status_code == status.HTTP_502_BAD_GATEWAY
    assert "Reference: ref-123456" in str(exc.value.detail)
    assert "sensitive-token-value" not in str(exc.value.detail)


def test_reconciliation_parse_error_is_sanitized() -> None:
    service = _service_with_fixed_reference("ref-parse-001")

    with pytest.raises(HTTPException) as exc:
        service._load_reconciliation_workbook(file_name="bad.xlsx", content=b"not-a-valid-workbook")

    assert exc.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "Could not parse reconciliation file." in str(exc.value.detail)
    assert "Reference: ref-parse-001" in str(exc.value.detail)
    assert "zip" not in str(exc.value.detail).lower()
