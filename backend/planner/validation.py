from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta
from typing import Any

from django.utils.dateparse import parse_datetime

from .errors import PlannerError

LOCATION_FIELDS = ("current_location", "pickup_location", "dropoff_location")


def _location_value(payload: dict[str, Any], field: str) -> dict[str, Any]:
    value = payload.get(field)
    if isinstance(value, str):
        value = {"query": value}
    if not isinstance(value, dict):
        raise PlannerError(
            code="VALIDATION_ERROR",
            field=field,
            message="Enter a city, state, ZIP code, or street address.",
            status=400,
        )

    query = value.get("query")
    has_coordinates = value.get("lat") is not None and value.get("lng") is not None
    if not has_coordinates and (not isinstance(query, str) or len(query.strip()) < 2):
        raise PlannerError(
            code="VALIDATION_ERROR",
            field=field,
            message="Enter a city, state, ZIP code, or street address.",
            status=400,
        )
    if isinstance(query, str) and len(query.strip()) > 200:
        raise PlannerError(
            code="VALIDATION_ERROR",
            field=field,
            message="Keep the location under 200 characters.",
            status=400,
        )

    if has_coordinates:
        try:
            lat = float(value["lat"])
            lng = float(value["lng"])
        except (TypeError, ValueError) as error:
            raise PlannerError(
                code="VALIDATION_ERROR",
                field=field,
                message="The supplied coordinates are not valid.",
                status=400,
            ) from error
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            raise PlannerError(
                code="VALIDATION_ERROR",
                field=field,
                message="The supplied coordinates are outside the valid range.",
                status=400,
            )
        return {
            "query": str(query or value.get("label") or f"{lat}, {lng}").strip(),
            "label": str(value.get("label") or query or f"{lat:.5f}, {lng:.5f}"),
            "lat": lat,
            "lng": lng,
        }

    return {"query": query.strip()}


def validate_plan_request(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise PlannerError(
            code="VALIDATION_ERROR",
            message="Send a JSON object with the four trip fields.",
            status=400,
        )

    locations = {field: _location_value(payload, field) for field in LOCATION_FIELDS}

    raw_cycle = payload.get("current_cycle_used_hours")
    if isinstance(raw_cycle, bool):
        raw_cycle = None
    try:
        cycle_hours = float(raw_cycle)
    except (TypeError, ValueError) as error:
        raise PlannerError(
            code="VALIDATION_ERROR",
            field="current_cycle_used_hours",
            message="Enter cycle hours from 0 to 70.",
            status=400,
        ) from error
    if not math.isfinite(cycle_hours) or not 0 <= cycle_hours <= 70:
        raise PlannerError(
            code="VALIDATION_ERROR",
            field="current_cycle_used_hours",
            message="Cycle hours must be between 0 and 70.",
            status=400,
        )

    raw_start = payload.get("start_at") or payload.get("departure_at")
    if raw_start is None:
        start_at = datetime.now(UTC)
        if start_at.second or start_at.microsecond:
            start_at = (start_at + timedelta(minutes=1)).replace(second=0, microsecond=0)
    elif isinstance(raw_start, str):
        start_at = parse_datetime(raw_start)
        if start_at is None or start_at.tzinfo is None:
            raise PlannerError(
                code="VALIDATION_ERROR",
                field="start_at",
                message="Start time must be a valid ISO date and include its UTC offset.",
                status=400,
            )
        start_at = start_at.astimezone(UTC).replace(second=0, microsecond=0)
    else:
        raise PlannerError(
            code="VALIDATION_ERROR",
            field="start_at",
            message="Start time must be an ISO date string.",
            status=400,
        )

    return {
        **locations,
        "current_cycle_used_minutes": round(cycle_hours * 60),
        "start_at": start_at,
    }
