import json
import logging

from django.http import HttpRequest, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from .errors import PlannerError
from .routing import resolve_route, suggest_locations, to_scheduler_locations
from .scheduler import TripScheduler
from .validation import validate_plan_request

logger = logging.getLogger(__name__)


ASSUMPTIONS = [
    {
        "code": "property_carrier_70_8",
        "message": "Single property-carrying driver using the 70-hour / 8-day cycle.",
    },
    {
        "code": "fresh_daily_clock",
        "message": "Fresh 11-hour driving and 14-hour duty clocks at departure after 10 hours off.",
    },
    {
        "code": "conservative_cycle",
        "message": (
            "Previously used cycle hours do not age out; a 34-hour restart is added if needed."
        ),
    },
    {
        "code": "service_time",
        "message": "Pickup and drop-off each take 1 hour on duty, not driving.",
    },
    {
        "code": "fuel_range",
        "message": "The trip starts with a full tank and adds 30-minute fueling every 1,000 miles.",
    },
]

WARNINGS = [
    {
        "code": "STANDARD_ROAD_PROFILE",
        "message": (
            "The free route uses a standard road profile. Confirm truck restrictions, "
            "clearances, and closures before driving."
        ),
    },
    {
        "code": "PLANNED_LOGS_ONLY",
        "message": (
            "These are planning estimates, not certified ELD records. Record actual "
            "activity in your approved ELD."
        ),
    },
]


@require_GET
def health(_request: HttpRequest) -> JsonResponse:
    return JsonResponse(
        {
            "status": "ok",
            "service": "milemark",
            "stack": "django",
        }
    )


@require_GET
def suggest_location(request: HttpRequest) -> JsonResponse:
    query = (request.GET.get("q") or "").strip()
    if len(query) < 3:
        return JsonResponse({"suggestions": []})
    try:
        return JsonResponse({"suggestions": suggest_locations(query)})
    except PlannerError:
        return JsonResponse({"suggestions": []})
    except Exception:
        logger.exception("Unexpected location-suggestion error")
        return JsonResponse({"suggestions": []})


@csrf_exempt
@require_POST
def plan_trip(request: HttpRequest) -> JsonResponse:
    try:
        payload = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        error = PlannerError(
            code="INVALID_JSON",
            message="Send a valid JSON request.",
            status=400,
        )
        return JsonResponse(error.payload(), status=error.status)

    try:
        request_data = validate_plan_request(payload)
        resolved, route, log_timezone = resolve_route(
            current_value=request_data["current_location"],
            pickup_value=request_data["pickup_location"],
            dropoff_value=request_data["dropoff_location"],
        )
        current, pickup, dropoff = to_scheduler_locations(resolved)
        result = TripScheduler(
            route=route,
            current=current,
            pickup=pickup,
            dropoff=dropoff,
            start_at=request_data["start_at"],
            current_cycle_used_minutes=request_data["current_cycle_used_minutes"],
            log_timezone=log_timezone,
        ).build()
        result["timezone"] = log_timezone
        result["resolved_locations"] = resolved
        result["route"] = {
            "geometry": route["geometry"],
            "bbox": route["bbox"],
            "legs": [
                {
                    key: value
                    for key, value in leg.items()
                    if key not in {"start_label", "end_label"}
                }
                for leg in route["legs"]
            ],
        }
        result["assumptions"] = ASSUMPTIONS
        result["warnings"] = WARNINGS
        return JsonResponse(result)
    except PlannerError as error:
        return JsonResponse(error.payload(), status=error.status)
    except Exception:
        logger.exception("Unexpected trip-planning error")
        error = PlannerError(
            code="INTERNAL_ERROR",
            message="We could not build the trip plan. Please try again.",
            status=500,
        )
        return JsonResponse(error.payload(), status=error.status)
