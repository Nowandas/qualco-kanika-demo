from app.domains.hospitality.service import HospitalityService


def _service() -> HospitalityService:
    return HospitalityService.__new__(HospitalityService)


def test_extract_promotion_offer_classifies_booking_and_arrival_window_as_early_booking() -> None:
    service = _service()
    text = (
        "EASYJET HOLIDAYS\n"
        "DISCOUNT: 10%\n"
        "BOOKING DATES: ALL BOOKINGS TAKEN 08/08/25 - 23/11/25\n"
        "ARRIVAL DATES: 26/10/25 - 23/11/25\n"
        "All other terms & conditions remain the same."
    )

    parsed = service._extract_promotion_offer(text, fallback_name="offer.pdf")

    assert parsed["discount_percent"] == 10.0
    assert parsed["promotion_category"] == "early_booking"
    assert parsed["booking_start_date"] is not None
    assert parsed["booking_end_date"] is not None
    assert parsed["arrival_start_date"] is not None
    assert parsed["arrival_end_date"] is not None


def test_is_early_booking_promotion_true_when_both_windows_exist_without_keyword() -> None:
    service = _service()
    promotion = {
        "offer_name": "EASYJET HOLIDAYS DISCOUNT",
        "description": "Seasonal discount terms.",
        "discount_percent": 10,
        "booking_start_date": "2025-08-08",
        "booking_end_date": "2025-11-23",
        "arrival_start_date": "2025-10-26",
        "arrival_end_date": "2025-11-23",
    }

    assert service._is_early_booking_promotion(promotion) is True
