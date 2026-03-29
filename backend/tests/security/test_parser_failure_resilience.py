from app.domains.hospitality.service import HospitalityService


def _service() -> HospitalityService:
    return HospitalityService.__new__(HospitalityService)


def test_invalid_pdf_does_not_raise_and_returns_empty_text() -> None:
    service = _service()
    text = service._extract_text_from_bytes(file_name="invalid.pdf", content=b"not-a-real-pdf")
    assert text == ""


def test_invalid_docx_does_not_raise_and_returns_empty_text() -> None:
    service = _service()
    text = service._extract_text_from_bytes(file_name="invalid.docx", content=b"not-a-zip-archive")
    assert text == ""


def test_plain_text_fallback_decodes_content() -> None:
    service = _service()
    text = service._extract_text_from_bytes(file_name="notes.txt", content=b"sample contract text")
    assert "sample contract text" in text
