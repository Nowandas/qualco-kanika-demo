from datetime import date

from app.domains.hospitality.service import HospitalityService


def _service() -> HospitalityService:
    return HospitalityService.__new__(HospitalityService)


def test_room_token_normalizes_front_sea_view_to_sea_view() -> None:
    service = _service()

    front_token = service._normalize_room_match_token("Deluxe Front Sea View")
    sea_token = service._normalize_room_match_token("Deluxe Room With Sea View,")

    assert front_token == sea_token


def test_room_match_prefers_sea_view_over_side_sea_view_for_front_sea_view() -> None:
    service = _service()

    sea_view_score = service._room_match_score("Deluxe Front Sea View", "Deluxe Room With Sea View")
    side_sea_view_score = service._room_match_score("Deluxe Front Sea View", "Deluxe Room With Side Sea View")

    assert sea_view_score > side_sea_view_score


def test_select_pricing_entry_prefers_sea_view_variant_for_front_sea_view_input() -> None:
    service = _service()
    pricing_context = {
        "entries_by_board": {
            "bb": [
                {
                    "room_type": "Deluxe Room With Side Sea View",
                    "board_type": "BB",
                    "age_bucket": "adult",
                    "age_category": "adult",
                    "adult_price": 122,
                },
                {
                    "room_type": "Deluxe Room With Sea View",
                    "board_type": "BB",
                    "age_bucket": "adult",
                    "age_category": "adult",
                    "adult_price": 136,
                },
            ]
        }
    }

    picked = service._select_pricing_entry_for_line(
        pricing_context=pricing_context,
        room_type="Deluxe Front Sea View",
        board_type="BB",
        stay_date=date(2025, 6, 27),
        age_bucket_candidates=["adult"],
        age_category="adult",
    )

    assert isinstance(picked, dict)
    assert picked.get("room_type") == "Deluxe Room With Sea View"
