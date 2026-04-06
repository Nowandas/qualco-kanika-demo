from app.domains.hospitality.service import HospitalityService


def _service() -> HospitalityService:
    return HospitalityService.__new__(HospitalityService)


def test_cancelled_status_detection_accepts_common_variants() -> None:
    service = _service()

    assert service._is_cancelled_reconciliation_status_value("Cancelled")
    assert service._is_cancelled_reconciliation_status_value("CXL")
    assert service._is_cancelled_reconciliation_status_value("No Show")
    assert service._is_cancelled_reconciliation_status_value("VOIDED")
    assert not service._is_cancelled_reconciliation_status_value("Free cancellation until 7 days")
    assert not service._is_cancelled_reconciliation_status_value("Confirmed")


def test_build_reconciliation_lines_from_header_mapping_skips_cancelled_rows() -> None:
    service = _service()
    sheet_payload = {
        "columns": [
            "reservation_ref",
            "room_type",
            "board_type",
            "stay_date",
            "nights",
            "adults",
            "children",
            "amount",
            "booking_status",
        ],
        "column_labels": [
            "Reservation Ref",
            "Room Type",
            "Board Type",
            "Stay Date",
            "Nights",
            "Adults",
            "Children",
            "Amount",
            "Booking Status",
        ],
        "rows": [
            {
                "row_number": 2,
                "values": {
                    "reservation_ref": "REF-1",
                    "room_type": "Deluxe Room With Sea View",
                    "board_type": "BB",
                    "stay_date": "2025-07-01",
                    "nights": "5",
                    "adults": "2",
                    "children": "0",
                    "amount": "1000",
                    "booking_status": "Cancelled",
                },
            },
            {
                "row_number": 3,
                "values": {
                    "reservation_ref": "REF-2",
                    "room_type": "Deluxe Room With Sea View",
                    "board_type": "BB",
                    "stay_date": "2025-07-01",
                    "nights": "5",
                    "adults": "2",
                    "children": "0",
                    "amount": "1200",
                    "booking_status": "Confirmed",
                },
            },
        ],
    }
    resolved_header_mapping = {
        "reservation_id": "reservation_ref",
        "room_type": "room_type",
        "board_type": "board_type",
        "stay_date": "stay_date",
        "nights": "nights",
        "pax_adults": "adults",
        "pax_children": "children",
        "actual_price": "amount",
        "status": "booking_status",
    }

    lines = service._build_reconciliation_lines_from_header_mapping(
        sheet_payload=sheet_payload,
        resolved_header_mapping=resolved_header_mapping,
        contract_id="contract-1",
        default_hotel="KAN",
        default_operator="JET2",
        sheet_title="Sheet1",
        max_lines=100,
        reservation_id_values=None,
    )

    assert len(lines) == 1
    assert lines[0]["reservation_id"] == "REF-2"


def test_normalize_ai_reconciliation_lines_skips_cancelled_status_rows() -> None:
    service = _service()
    ai_lines = [
        {
            "row_number": 2,
            "reservation_id": "REF-1",
            "room_type": "Deluxe Room With Sea View",
            "board_type": "BB",
            "stay_date": "2025-07-01",
            "nights": 5,
            "pax_adults": 2,
            "pax_children": 0,
            "actual_price": 1000,
            "status": "canceled",
        },
        {
            "row_number": 3,
            "reservation_id": "REF-2",
            "room_type": "Deluxe Room With Sea View",
            "board_type": "BB",
            "stay_date": "2025-07-01",
            "nights": 5,
            "pax_adults": 2,
            "pax_children": 0,
            "actual_price": 1200,
            "reservation_status": "confirmed",
        },
    ]

    lines = service._normalize_ai_reconciliation_lines(
        ai_lines=ai_lines,
        contract_id="contract-1",
        default_hotel="KAN",
        default_operator="JET2",
        sheet_title="Sheet1",
        max_lines=100,
        reservation_id_values=None,
    )

    assert len(lines) == 1
    assert lines[0]["reservation_id"] == "REF-2"
