from __future__ import annotations

import math
import time
from typing import Any
from urllib.parse import quote, urlencode

from .errors import PlannerError
from .scheduler import METER_PER_MILE, Location

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
PHOTON_URL = "https://photon.komoot.io/api"
OSRM_URL = "https://routing.openstreetmap.de/routed-car/route/v1/driving"
TIMEZONE_URL = "https://timeapi.io/api/timezone/coordinate"
REQUEST_HEADERS = {
    "User-Agent": "Milemark/1.0 (HOS trip-planning assessment)",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
}

_geocode_cache: dict[str, dict[str, Any]] = {}
_suggest_cache: dict[str, list[dict[str, Any]]] = {}


def _on_workers() -> bool:
    try:
        import js  # noqa: F401

        return True
    except ImportError:
        return False


def _pause(seconds: float) -> None:
    if seconds <= 0:
        return
    if _on_workers():
        from js import Promise, setTimeout
        from pyodide.ffi import run_sync

        run_sync(Promise.new(lambda resolve, _reject: setTimeout(resolve, int(seconds * 1000))))
        return
    time.sleep(seconds)


def _get_json(url: str, *, params: dict[str, Any] | None = None, timeout: float = 12) -> Any:
    query = f"{url}?{urlencode(params)}" if params else url
    if _on_workers():
        from pyodide.ffi import run_sync
        from workers import fetch

        async def _fetch() -> Any:
            response = await fetch(query, headers=REQUEST_HEADERS)
            if response.status >= 400:
                raise PlannerError(
                    code="UPSTREAM_UNAVAILABLE",
                    message="A mapping service is temporarily unavailable. Please try again.",
                    status=502,
                )
            return await response.json()

        try:
            return run_sync(_fetch())
        except PlannerError:
            raise
        except Exception as error:
            raise PlannerError(
                code="UPSTREAM_UNAVAILABLE",
                message="A mapping service is temporarily unavailable. Please try again.",
                status=502,
            ) from error

    import httpx

    try:
        with httpx.Client(
            headers=REQUEST_HEADERS,
            follow_redirects=True,
            timeout=timeout,
        ) as client:
            response = client.get(query)
            response.raise_for_status()
            return response.json()
    except httpx.TimeoutException as error:
        raise PlannerError(
            code="UPSTREAM_TIMEOUT",
            message="The mapping service took too long. Please try again.",
            status=504,
        ) from error
    except (httpx.HTTPError, ValueError, TypeError) as error:
        raise PlannerError(
            code="UPSTREAM_UNAVAILABLE",
            message="A mapping service is temporarily unavailable. Please try again.",
            status=502,
        ) from error


def _state_code(address: dict[str, Any]) -> str | None:
    iso = address.get("ISO3166-2-lvl4") or address.get("ISO3166-2-lvl3")
    if isinstance(iso, str) and iso.startswith("US-"):
        return iso.removeprefix("US-")
    return None


def _short_label(result: dict[str, Any], fallback: str) -> str:
    address = result.get("address") or {}
    state = _state_code(address) or address.get("state")
    city = next(
        (
            address.get(key)
            for key in ("city", "town", "village", "municipality", "hamlet", "county")
            if address.get(key)
        ),
        None,
    )
    road = address.get("road")
    house = address.get("house_number")
    parts: list[str] = []
    if road:
        parts.append(" ".join(str(item) for item in (house, road) if item))
    if city and city not in parts:
        parts.append(str(city))
    if state:
        parts.append(str(state))
    if parts:
        return ", ".join(parts[:3])
    display = result.get("display_name")
    if isinstance(display, str) and display:
        return ", ".join(display.split(",")[:3])
    return fallback


def _fallback_timezone(lat: float, lng: float, state_code: str | None = None) -> str:
    if state_code == "HI" or (lat < 23 and lng < -154):
        return "Pacific/Honolulu"
    if state_code == "AK" or (lat > 51 and lng < -129):
        return "America/Anchorage"
    if state_code == "AZ":
        return "America/Phoenix"
    if lng >= -85:
        return "America/New_York"
    if lng >= -102:
        return "America/Chicago"
    if lng >= -115:
        return "America/Denver"
    return "America/Los_Angeles"


def _timezone_for(*, lat: float, lng: float, fallback: str) -> str:
    try:
        payload = _get_json(
            TIMEZONE_URL,
            params={"latitude": lat, "longitude": lng},
            timeout=5,
        )
        name = payload.get("timeZone") or payload.get("timeZoneId")
        if isinstance(name, str) and "/" in name:
            return name
    except PlannerError:
        pass
    return fallback


def _geocode(value: dict[str, Any], *, field: str) -> dict[str, Any]:
    if "lat" in value and "lng" in value:
        fallback_timezone = _fallback_timezone(float(value["lat"]), float(value["lng"]))
        return {
            "input": value["query"],
            "display_name": value["label"],
            "lat": float(value["lat"]),
            "lng": float(value["lng"]),
            "timezone": fallback_timezone,
        }

    query = value["query"]
    cache_key = query.casefold()
    if cache_key in _geocode_cache:
        return dict(_geocode_cache[cache_key])

    try:
        matches = _get_json(
            NOMINATIM_URL,
            params={
                "q": query,
                "format": "jsonv2",
                "addressdetails": 1,
                "countrycodes": "us",
                "limit": 1,
            },
            timeout=12,
        )
    except PlannerError as error:
        if error.code == "UPSTREAM_TIMEOUT":
            raise PlannerError(
                code="GEOCODER_TIMEOUT",
                field=field,
                message="The location service took too long. Please try again.",
                status=504,
            ) from error
        raise PlannerError(
            code="GEOCODER_UNAVAILABLE",
            field=field,
            message="The location service is temporarily unavailable. Please try again.",
            status=502,
        ) from error

    if not isinstance(matches, list) or not matches:
        raise PlannerError(
            code="LOCATION_NOT_FOUND",
            field=field,
            message=(
                f"We could not find that {field.replace('_', ' ')}. "
                "Add a city, state, or ZIP code."
            ),
            status=422,
        )

    match = matches[0]
    address = match.get("address") or {}
    try:
        lat = float(match["lat"])
        lng = float(match["lon"])
    except (KeyError, TypeError, ValueError) as error:
        raise PlannerError(
            code="GEOCODER_UNAVAILABLE",
            field=field,
            message="The location service returned an incomplete result. Please try again.",
            status=502,
        ) from error

    result = {
        "input": query,
        "display_name": _short_label(match, query),
        "lat": lat,
        "lng": lng,
        "timezone": _fallback_timezone(lat, lng, _state_code(address)),
    }
    _geocode_cache[cache_key] = result
    return dict(result)


def _maneuver_instruction(step: dict[str, Any]) -> str:
    maneuver = step.get("maneuver") or {}
    maneuver_type = str(maneuver.get("type") or "continue").replace("_", " ")
    modifier = str(maneuver.get("modifier") or "").replace("slight ", "slight ")
    road = str(step.get("name") or "").strip()
    destination = str(step.get("destinations") or "").strip()
    exit_number = maneuver.get("exit")

    if maneuver_type == "depart":
        text = "Start"
    elif maneuver_type == "arrive":
        return "Arrive at the destination"
    elif maneuver_type in {"roundabout", "rotary"}:
        text = (
            f"At the roundabout, take exit {exit_number}" if exit_number else "Enter the roundabout"
        )
    elif maneuver_type in {"on ramp", "off ramp"}:
        text = f"Take the {modifier + ' ' if modifier else ''}{maneuver_type}"
    elif maneuver_type == "merge":
        text = f"Merge {modifier}".strip()
    elif maneuver_type == "fork":
        text = f"Keep {modifier}".strip()
    elif maneuver_type == "new name":
        text = "Continue"
    else:
        text = f"{maneuver_type.title()} {modifier}".strip()

    if road:
        text += f" onto {road}"
    if destination and destination not in text:
        text += f" toward {destination}"
    return text


def _parse_step(step: dict[str, Any], sequence: int) -> dict[str, Any]:
    coordinate = (step.get("maneuver") or {}).get("location") or [0, 0]
    return {
        "sequence": sequence,
        "instruction": _maneuver_instruction(step),
        "road_name": step.get("name") or None,
        "distance_meters": round(float(step.get("distance") or 0)),
        "duration_minutes": max(0, round(float(step.get("duration") or 0) / 60)),
        "lat": float(coordinate[1]),
        "lng": float(coordinate[0]),
    }


def resolve_route(
    *,
    current_value: dict[str, Any],
    pickup_value: dict[str, Any],
    dropoff_value: dict[str, Any],
) -> tuple[dict[str, dict[str, Any]], dict[str, Any], str]:
    resolved: dict[str, dict[str, Any]] = {}
    for index, (key, field, value) in enumerate(
        (
            ("current", "current_location", current_value),
            ("pickup", "pickup_location", pickup_value),
            ("dropoff", "dropoff_location", dropoff_value),
        )
    ):
        if index and "lat" not in value:
            # Nominatim's public endpoint requires an absolute maximum of one request/second.
            _pause(1.05)
        resolved[key] = _geocode(value, field=field)

    origin = resolved["current"]
    origin["timezone"] = _timezone_for(
        lat=origin["lat"],
        lng=origin["lng"],
        fallback=origin["timezone"],
    )

    coordinates = ";".join(
        f"{resolved[key]['lng']},{resolved[key]['lat']}"
        for key in ("current", "pickup", "dropoff")
    )
    route_url = f"{OSRM_URL}/{quote(coordinates, safe=',;-.')}"
    try:
        payload = _get_json(
            route_url,
            params={
                "overview": "simplified",
                "geometries": "geojson",
                "steps": "true",
                "alternatives": "false",
            },
            timeout=25,
        )
    except PlannerError as error:
        if error.code == "UPSTREAM_TIMEOUT":
            raise PlannerError(
                code="ROUTING_TIMEOUT",
                message="The route service took too long. Please try again.",
                status=504,
            ) from error
        raise PlannerError(
            code="ROUTING_UNAVAILABLE",
            message="The route service is temporarily unavailable. Please try again.",
            status=502,
        ) from error

    routes = payload.get("routes") if isinstance(payload, dict) else None
    if payload.get("code") != "Ok" or not routes:
        raise PlannerError(
            code="ROUTE_NOT_FOUND",
            message="No drivable route was found through those three locations.",
            status=422,
        )

    raw_route = routes[0]
    raw_legs = raw_route.get("legs") or []
    if len(raw_legs) != 2:
        raise PlannerError(
            code="ROUTING_UNAVAILABLE",
            message="The route service returned an incomplete route. Please try again.",
            status=502,
        )

    labels = [
        resolved["current"]["display_name"],
        resolved["pickup"]["display_name"],
        resolved["dropoff"]["display_name"],
    ]
    legs: list[dict[str, Any]] = []
    step_sequence = 1
    for index, raw_leg in enumerate(raw_legs):
        distance = round(float(raw_leg.get("distance") or 0))
        provider_minutes = math.ceil(float(raw_leg.get("duration") or 0) / 60)
        conservative_minutes = math.ceil((distance / METER_PER_MILE) / 55 * 60)
        steps = []
        for raw_step in raw_leg.get("steps") or []:
            steps.append(_parse_step(raw_step, step_sequence))
            step_sequence += 1
        legs.append(
            {
                "kind": "current_to_pickup" if index == 0 else "pickup_to_dropoff",
                "distance_meters": distance,
                "driving_minutes": max(
                    provider_minutes,
                    conservative_minutes,
                    1 if distance else 0,
                ),
                "start_label": labels[index],
                "end_label": labels[index + 1],
                "steps": steps,
            }
        )

    geometry = raw_route.get("geometry") or {"type": "LineString", "coordinates": []}
    geometry_coordinates = geometry.get("coordinates") or [
        [resolved["current"]["lng"], resolved["current"]["lat"]],
        [resolved["dropoff"]["lng"], resolved["dropoff"]["lat"]],
    ]
    lngs = [coordinate[0] for coordinate in geometry_coordinates]
    lats = [coordinate[1] for coordinate in geometry_coordinates]
    route = {
        "distance_meters": sum(leg["distance_meters"] for leg in legs),
        "geometry": {"type": "LineString", "coordinates": geometry_coordinates},
        "bbox": [min(lngs), min(lats), max(lngs), max(lats)],
        "legs": legs,
    }
    return resolved, route, origin["timezone"]


def suggest_locations(query: str, *, limit: int = 5) -> list[dict[str, Any]]:
    cleaned = query.strip()
    if len(cleaned) < 3:
        return []
    cache_key = f"{cleaned.casefold()}::{limit}"
    if cache_key in _suggest_cache:
        return [dict(item) for item in _suggest_cache[cache_key]]

    payload = _get_json(
        PHOTON_URL,
        params={
            "q": cleaned,
            "limit": max(1, min(limit, 8)),
            "lang": "en",
        },
        timeout=8,
    )
    features = payload.get("features") if isinstance(payload, dict) else []
    if not isinstance(features, list):
        return []

    suggestions: list[dict[str, Any]] = []
    seen: set[str] = set()
    for feature in features:
        if not isinstance(feature, dict):
            continue
        properties = feature.get("properties")
        geometry = feature.get("geometry")
        if not isinstance(properties, dict) or not isinstance(geometry, dict):
            continue
        coordinates = geometry.get("coordinates")
        if not (
            isinstance(coordinates, list)
            and len(coordinates) >= 2
            and all(isinstance(value, (int, float)) for value in coordinates[:2])
        ):
            continue
        label = ", ".join(
            str(part).strip()
            for part in (
                properties.get("name"),
                properties.get("city"),
                properties.get("state"),
            )
            if part
        ) or str(properties.get("name") or "").strip()
        if not label:
            continue
        dedupe = label.casefold()
        if dedupe in seen:
            continue
        seen.add(dedupe)
        suggestions.append(
            {
                "label": label,
                "lat": float(coordinates[1]),
                "lng": float(coordinates[0]),
            }
        )
        if len(suggestions) >= limit:
            break

    _suggest_cache[cache_key] = suggestions
    return [dict(item) for item in suggestions]


def to_scheduler_locations(
    resolved: dict[str, dict[str, Any]],
) -> tuple[Location, Location, Location]:
    return tuple(
        Location(
            label=resolved[key]["display_name"],
            lat=resolved[key]["lat"],
            lng=resolved[key]["lng"],
        )
        for key in ("current", "pickup", "dropoff")
    )  # type: ignore[return-value]
