from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, status

from app.domains.hospitality.service import HospitalityService


def _service(*, app_env: str, enabled: bool, root: str | None) -> HospitalityService:
    service = HospitalityService.__new__(HospitalityService)
    service.settings = SimpleNamespace(
        app_env=app_env,
        seed_path_ingestion_enabled=enabled,
        seed_ingestion_root=root,
    )
    return service


def test_seed_path_ingestion_disabled_in_non_local_environment(tmp_path: Path) -> None:
    target = tmp_path / "contract.pdf"
    target.write_bytes(b"content")
    service = _service(app_env="production", enabled=False, root=None)

    with pytest.raises(HTTPException) as exc:
        service._resolve_seed_file_path(path_value=str(target), label="Contract")

    assert exc.value.status_code == status.HTTP_403_FORBIDDEN
    assert "disabled" in str(exc.value.detail).lower()


def test_seed_path_rejects_outside_allowlisted_root(tmp_path: Path) -> None:
    allow_root = tmp_path / "allow"
    allow_root.mkdir(parents=True)
    outside_file = tmp_path / "outside.pdf"
    outside_file.write_bytes(b"content")
    service = _service(app_env="production", enabled=True, root=str(allow_root))

    with pytest.raises(HTTPException) as exc:
        service._resolve_seed_file_path(path_value=str(outside_file), label="Contract")

    assert exc.value.status_code == status.HTTP_403_FORBIDDEN
    assert "outside the allowed ingestion root" in str(exc.value.detail)


def test_seed_path_allows_file_inside_allowlisted_root(tmp_path: Path) -> None:
    allow_root = tmp_path / "allow"
    allow_root.mkdir(parents=True)
    target = allow_root / "seed-contract.pdf"
    target.write_bytes(b"content")
    service = _service(app_env="production", enabled=True, root=str(allow_root))

    resolved = service._resolve_seed_file_path(path_value=str(target), label="Contract")

    assert resolved == target.resolve()


def test_seed_path_not_found_message_does_not_echo_input_path(tmp_path: Path) -> None:
    allow_root = tmp_path / "allow"
    allow_root.mkdir(parents=True)
    missing = allow_root / "missing.pdf"
    service = _service(app_env="production", enabled=True, root=str(allow_root))

    with pytest.raises(HTTPException) as exc:
        service._resolve_seed_file_path(path_value=str(missing), label="Contract")

    assert exc.value.status_code == status.HTTP_404_NOT_FOUND
    assert "seed file was not found" in str(exc.value.detail)
    assert str(missing) not in str(exc.value.detail)


def test_seed_path_allowed_in_local_environment_without_explicit_toggle(tmp_path: Path) -> None:
    target = tmp_path / "local-seed.pdf"
    target.write_bytes(b"content")
    service = _service(app_env="local", enabled=False, root=None)

    resolved = service._resolve_seed_file_path(path_value=str(target), label="Contract")

    assert resolved == target.resolve()
