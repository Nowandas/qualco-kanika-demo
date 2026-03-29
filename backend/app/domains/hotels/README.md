# Hotels Domain

Manages persisted hotel entities used as first-class references across hospitality documents and derived data.

## Endpoints

- `GET /api/v1/hotels?include_inactive=true|false` (admin)
- `POST /api/v1/hotels` (admin)
- `PATCH /api/v1/hotels/{hotel_id}` (admin)

## Notes

- Frontend hotel sidebar scope is driven by this domain.
- Contract/promotion/pricing/reconciliation workflows depend on selected hotel context.
