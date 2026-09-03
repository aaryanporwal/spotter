from __future__ import annotations

import math
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

METER_PER_MILE = 1609.344

DRIVE_SHIFT_LIMIT = 11 * 60
DUTY_WINDOW_LIMIT = 14 * 60
BREAK_DRIVE_LIMIT = 8 * 60
QUALIFYING_BREAK = 30
DAILY_RESET = 10 * 60
CYCLE_LIMIT = 70 * 60
CYCLE_RESTART = 34 * 60
PICKUP_DURATION = 60
DROPOFF_DURATION = 60
FUEL_DURATION = 30
FUEL_INTERVAL_METERS = round(1000 * METER_PER_MILE)

OFF_DUTY = "off_duty"
SLEEPER_BERTH = "sleeper_berth"
DRIVING = "driving"
ON_DUTY = "on_duty_not_driving"


@dataclass(frozen=True)
class Location:
    label: str
    lat: float
    lng: float

    @property
    def coordinate(self) -> list[float]:
        return [self.lng, self.lat]


def _iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _hours_label(minutes: int) -> str:
    hours, remainder = divmod(minutes, 60)
    return f"{hours}:{remainder:02d}"


def _time_label(minute: int) -> str:
    minute = max(0, min(1439, minute))
    hour, remainder = divmod(minute, 60)
    suffix = "AM" if hour < 12 else "PM"
    display_hour = hour % 12 or 12
    return f"{display_hour}:{remainder:02d} {suffix}"


def _haversine_meters(a: list[float], b: list[float]) -> float:
    lon1, lat1 = map(math.radians, a)
    lon2, lat2 = map(math.radians, b)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * 6_371_000 * math.asin(math.sqrt(value))


class RouteInterpolator:
    def __init__(self, coordinates: list[list[float]], route_distance_meters: int) -> None:
        self.coordinates = coordinates
        self.route_distance_meters = max(route_distance_meters, 1)
        cumulative = [0.0]
        for start, end in zip(coordinates, coordinates[1:], strict=False):
            cumulative.append(cumulative[-1] + _haversine_meters(start, end))
        self.cumulative = cumulative
        self.geometry_distance = cumulative[-1] if cumulative else 0.0

    def at(self, route_meters: int) -> list[float]:
        if not self.coordinates:
            return [0.0, 0.0]
        if len(self.coordinates) == 1 or self.geometry_distance <= 0:
            return list(self.coordinates[0])

        fraction = max(0.0, min(1.0, route_meters / self.route_distance_meters))
        target = fraction * self.geometry_distance
        for index in range(1, len(self.cumulative)):
            if self.cumulative[index] < target:
                continue
            before = self.cumulative[index - 1]
            segment = self.cumulative[index] - before
            segment_fraction = 0.0 if segment == 0 else (target - before) / segment
            start = self.coordinates[index - 1]
            end = self.coordinates[index]
            return [
                start[0] + (end[0] - start[0]) * segment_fraction,
                start[1] + (end[1] - start[1]) * segment_fraction,
            ]
        return list(self.coordinates[-1])


class TripScheduler:
    def __init__(
        self,
        *,
        route: dict[str, Any],
        current: Location,
        pickup: Location,
        dropoff: Location,
        start_at: datetime,
        current_cycle_used_minutes: int,
        log_timezone: str,
    ) -> None:
        self.route = route
        self.current_location = current
        self.pickup_location = pickup
        self.dropoff_location = dropoff
        self.start_at = start_at.astimezone(UTC)
        self.now = self.start_at
        self.initial_cycle_used = current_cycle_used_minutes
        self.cycle_used = current_cycle_used_minutes
        self.shift_start: datetime | None = None
        self.shift_drive = 0
        self.drive_since_break = 0
        self.route_progress = 0
        self.next_fuel_at = FUEL_INTERVAL_METERS
        self.events: list[dict[str, Any]] = []
        self.stops: list[dict[str, Any]] = []
        self.pickup_at: datetime | None = None
        self.delivery_at: datetime | None = None
        self.log_timezone = log_timezone

        geometry = route["geometry"]["coordinates"]
        self.total_distance = int(route["distance_meters"])
        self.interpolator = RouteInterpolator(geometry, self.total_distance)
        self._leg_ends: list[tuple[int, str]] = []
        progress = 0
        for leg in route["legs"]:
            progress += int(leg["distance_meters"])
            self._leg_ends.append((progress, leg["end_label"]))

    def build(self) -> dict[str, Any]:
        self._add_stop(
            stop_type="start",
            label=f"Start · {self.current_location.label}",
            reason="Trip starts",
            start=self.start_at,
            end=self.start_at,
            status=OFF_DUTY,
            qualifies=False,
            coordinate=self.current_location.coordinate,
        )

        for index, leg in enumerate(self.route["legs"]):
            self._drive_leg(leg)
            self._fuel_if_due()
            if index == 0:
                self.pickup_at = self.now
                self._service(
                    stop_type="pickup",
                    location=self.pickup_location,
                    duration=PICKUP_DURATION,
                    reason="Pickup",
                )
            else:
                self._service(
                    stop_type="dropoff",
                    location=self.dropoff_location,
                    duration=DROPOFF_DURATION,
                    reason="Drop-off",
                )
                self.delivery_at = self.now

        if self.delivery_at is None:
            self.delivery_at = self.now

        logs = build_daily_logs(
            events=self.events,
            start_at=self.start_at,
            end_at=self.delivery_at,
            timezone_name=self.log_timezone,
            initial_cycle_used=self.initial_cycle_used,
        )

        serialized_events = [self._serialize_event(event) for event in self.events]
        serialized_stops = [self._serialize_stop(stop) for stop in self.stops]
        drive_minutes = sum(
            event["duration_minutes"] for event in self.events if event["status"] == DRIVING
        )

        return {
            "plan_id": str(uuid.uuid4()),
            "generated_at": _iso(datetime.now(UTC)),
            "log_timezone": self.log_timezone,
            "summary": {
                "distance_meters": self.total_distance,
                "driving_minutes": drive_minutes,
                "elapsed_minutes": round((self.delivery_at - self.start_at).total_seconds() / 60),
                "start_at": _iso(self.start_at),
                "pickup_at": _iso(self.pickup_at or self.start_at),
                "delivery_at": _iso(self.delivery_at),
                "daily_log_count": len(logs),
                "fuel_stop_count": sum(stop["type"] == "fuel" for stop in self.stops),
                "rest_stop_count": sum(
                    stop["type"] in {"break", "daily_rest", "cycle_restart"} for stop in self.stops
                ),
                "cycle_used_start_minutes": self.initial_cycle_used,
                "cycle_used_end_minutes": self.cycle_used,
                "cycle_remaining_minutes": CYCLE_LIMIT - self.cycle_used,
            },
            "stops": serialized_stops,
            "duty_events": serialized_events,
            "daily_logs": logs,
        }

    def _drive_leg(self, leg: dict[str, Any]) -> None:
        remaining_distance = int(leg["distance_meters"])
        remaining_minutes = max(1, int(leg["driving_minutes"])) if remaining_distance else 0
        leg_end_progress = self.route_progress + remaining_distance

        while remaining_distance > 0:
            if remaining_minutes <= 0:
                remaining_minutes = 1

            self._prepare_for_driving()

            window_remaining = self._window_remaining()
            allowed = min(
                remaining_minutes,
                DRIVE_SHIFT_LIMIT - self.shift_drive,
                BREAK_DRIVE_LIMIT - self.drive_since_break,
                CYCLE_LIMIT - self.cycle_used,
                window_remaining,
            )

            distance_to_fuel = self.next_fuel_at - self.route_progress
            fuel_is_on_leg = 0 < distance_to_fuel <= remaining_distance
            fuel_minutes = None
            if fuel_is_on_leg:
                fuel_minutes = max(
                    1,
                    math.ceil(remaining_minutes * distance_to_fuel / remaining_distance),
                )
                allowed = min(allowed, fuel_minutes)

            if allowed <= 0:
                # Every zero boundary is handled by _prepare_for_driving. This guard prevents
                # a provider rounding edge case from creating an infinite loop.
                self._take_daily_reset()
                continue

            if allowed >= remaining_minutes:
                distance = remaining_distance
            elif fuel_minutes is not None and allowed == fuel_minutes:
                distance = distance_to_fuel
            else:
                distance = max(1, round(remaining_distance * allowed / remaining_minutes))

            distance = min(distance, remaining_distance)
            start_progress = self.route_progress
            end_progress = self.route_progress + distance
            start_label = self._route_label(start_progress)
            end_label = (
                leg["end_label"]
                if end_progress >= leg_end_progress
                else self._route_label(end_progress)
            )

            self._append_event(
                status=DRIVING,
                duration=allowed,
                distance_meters=distance,
                start_label=start_label,
                end_label=end_label,
                reason=f"Drive to {leg['end_label']}",
                start_coordinate=self.interpolator.at(start_progress),
                end_coordinate=self.interpolator.at(end_progress),
            )
            self.route_progress = end_progress
            remaining_distance -= distance
            remaining_minutes -= allowed

            if self.route_progress >= self.next_fuel_at:
                # Rest/cycle boundaries outrank a coincident fuel task.
                self._prepare_for_on_duty(FUEL_DURATION, rest_before_if_drive_limit=True)
                self._add_fuel_stop()

    def _prepare_for_driving(self) -> None:
        while True:
            if self.cycle_used >= CYCLE_LIMIT:
                self._take_cycle_restart()
                continue
            if self.shift_start is not None and (
                self.shift_drive >= DRIVE_SHIFT_LIMIT or self._window_remaining() <= 0
            ):
                self._take_daily_reset()
                continue
            if self.route_progress >= self.next_fuel_at:
                self._prepare_for_on_duty(FUEL_DURATION, rest_before_if_drive_limit=True)
                self._add_fuel_stop()
                continue
            if self.drive_since_break >= BREAK_DRIVE_LIMIT:
                if self._window_remaining() <= QUALIFYING_BREAK:
                    self._take_daily_reset()
                else:
                    self._take_break()
                continue
            return

    def _prepare_for_on_duty(self, duration: int, *, rest_before_if_drive_limit: bool) -> None:
        if CYCLE_LIMIT - self.cycle_used < duration:
            self._take_cycle_restart()
        if (
            rest_before_if_drive_limit
            and self.shift_start is not None
            and (self.shift_drive >= DRIVE_SHIFT_LIMIT or self._window_remaining() <= 0)
        ):
            self._take_daily_reset()

    def _service(
        self,
        *,
        stop_type: str,
        location: Location,
        duration: int,
        reason: str,
    ) -> None:
        self._prepare_for_on_duty(duration, rest_before_if_drive_limit=False)
        event = self._append_event(
            status=ON_DUTY,
            duration=duration,
            distance_meters=0,
            start_label=location.label,
            end_label=location.label,
            reason=reason,
            start_coordinate=location.coordinate,
            end_coordinate=location.coordinate,
        )
        self._add_stop(
            stop_type=stop_type,
            label=f"{reason} · {location.label}",
            reason=reason,
            start=event["start"],
            end=event["end"],
            status=ON_DUTY,
            qualifies=True,
            coordinate=location.coordinate,
        )

    def _fuel_if_due(self) -> None:
        while self.route_progress >= self.next_fuel_at:
            self._prepare_for_on_duty(FUEL_DURATION, rest_before_if_drive_limit=True)
            self._add_fuel_stop()

    def _add_fuel_stop(self) -> None:
        progress = min(self.route_progress, self.total_distance)
        coordinate = self.interpolator.at(progress)
        location = self._route_label(progress)
        event = self._append_event(
            status=ON_DUTY,
            duration=FUEL_DURATION,
            distance_meters=0,
            start_label=location,
            end_label=location,
            reason="Fuel — verify station",
            start_coordinate=coordinate,
            end_coordinate=coordinate,
        )
        self._add_stop(
            stop_type="fuel",
            label=f"Fuel required · {location}",
            reason="Fuel at the 1,000-mile interval; verify a truck-accessible station.",
            start=event["start"],
            end=event["end"],
            status=ON_DUTY,
            qualifies=True,
            coordinate=coordinate,
        )
        self.next_fuel_at += FUEL_INTERVAL_METERS

    def _take_break(self) -> None:
        coordinate = self.interpolator.at(self.route_progress)
        location = self._route_label(self.route_progress)
        event = self._append_event(
            status=OFF_DUTY,
            duration=QUALIFYING_BREAK,
            distance_meters=0,
            start_label=location,
            end_label=location,
            reason="30-minute HOS break",
            start_coordinate=coordinate,
            end_coordinate=coordinate,
        )
        self._add_stop(
            stop_type="break",
            label=f"30-minute break · {location}",
            reason="Required after 8 cumulative driving hours.",
            start=event["start"],
            end=event["end"],
            status=OFF_DUTY,
            qualifies=True,
            coordinate=coordinate,
        )

    def _take_daily_reset(self) -> None:
        coordinate = self.interpolator.at(self.route_progress)
        location = self._route_label(self.route_progress)
        event = self._append_event(
            status=OFF_DUTY,
            duration=DAILY_RESET,
            distance_meters=0,
            start_label=location,
            end_label=location,
            reason="10-hour off-duty reset",
            start_coordinate=coordinate,
            end_coordinate=coordinate,
        )
        self._add_stop(
            stop_type="daily_rest",
            label=f"10-hour rest · {location}",
            reason="Resets the 11-hour driving and 14-hour duty clocks.",
            start=event["start"],
            end=event["end"],
            status=OFF_DUTY,
            qualifies=True,
            coordinate=coordinate,
        )

    def _take_cycle_restart(self) -> None:
        coordinate = self.interpolator.at(self.route_progress)
        location = self._route_label(self.route_progress)
        event = self._append_event(
            status=OFF_DUTY,
            duration=CYCLE_RESTART,
            distance_meters=0,
            start_label=location,
            end_label=location,
            reason="34-hour cycle restart",
            start_coordinate=coordinate,
            end_coordinate=coordinate,
            resets_cycle=True,
        )
        self._add_stop(
            stop_type="cycle_restart",
            label=f"34-hour restart · {location}",
            reason="Restarts the conservative 70-hour / 8-day calculation.",
            start=event["start"],
            end=event["end"],
            status=OFF_DUTY,
            qualifies=True,
            coordinate=coordinate,
        )

    def _append_event(
        self,
        *,
        status: str,
        duration: int,
        distance_meters: int,
        start_label: str,
        end_label: str,
        reason: str,
        start_coordinate: list[float],
        end_coordinate: list[float],
        resets_cycle: bool = False,
    ) -> dict[str, Any]:
        start = self.now
        end = start + timedelta(minutes=duration)
        cycle_before = self.cycle_used

        if status in {DRIVING, ON_DUTY}:
            if self.shift_start is None:
                self.shift_start = start
            self.cycle_used += duration
        if status == DRIVING:
            self.shift_drive += duration
            self.drive_since_break += duration
        elif duration >= QUALIFYING_BREAK:
            self.drive_since_break = 0

        if status == OFF_DUTY and duration >= DAILY_RESET:
            self.shift_start = None
            self.shift_drive = 0
            self.drive_since_break = 0
        if resets_cycle:
            self.cycle_used = 0

        event = {
            "id": f"event-{len(self.events) + 1}",
            "status": status,
            "start": start,
            "end": end,
            "duration_minutes": duration,
            "distance_meters": distance_meters,
            "location_start": start_label,
            "location_end": end_label,
            "coordinate_start": start_coordinate,
            "coordinate_end": end_coordinate,
            "reason": reason,
            "cycle_used_before_minutes": cycle_before,
            "cycle_used_after_minutes": self.cycle_used,
            "resets_cycle": resets_cycle,
        }
        self.events.append(event)
        self.now = end
        return event

    def _window_remaining(self) -> int:
        if self.shift_start is None:
            return DUTY_WINDOW_LIMIT
        elapsed = round((self.now - self.shift_start).total_seconds() / 60)
        return max(0, DUTY_WINDOW_LIMIT - elapsed)

    def _route_label(self, progress: int) -> str:
        if progress <= 0:
            return self.current_location.label
        for leg_end, label in self._leg_ends:
            if abs(progress - leg_end) <= 1:
                return label
        return f"Route mile {progress / METER_PER_MILE:,.0f}"

    def _add_stop(
        self,
        *,
        stop_type: str,
        label: str,
        reason: str,
        start: datetime,
        end: datetime,
        status: str,
        qualifies: bool,
        coordinate: list[float],
    ) -> None:
        self.stops.append(
            {
                "id": f"stop-{len(self.stops) + 1}",
                "sequence": len(self.stops) + 1,
                "type": stop_type,
                "label": label,
                "lat": coordinate[1],
                "lng": coordinate[0],
                "route_mile": round(self.route_progress / METER_PER_MILE, 1),
                "arrival": start,
                "departure": end,
                "duration_minutes": round((end - start).total_seconds() / 60),
                "duty_status": status,
                "reason": reason,
                "qualifies_as_30_minute_break": qualifies,
            }
        )

    @staticmethod
    def _serialize_event(event: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": event["id"],
            "status": event["status"],
            "start_at": _iso(event["start"]),
            "end_at": _iso(event["end"]),
            "duration_minutes": event["duration_minutes"],
            "distance_meters": event["distance_meters"],
            "location_start": event["location_start"],
            "location_end": event["location_end"],
            "reason": event["reason"],
        }

    @staticmethod
    def _serialize_stop(stop: dict[str, Any]) -> dict[str, Any]:
        return {
            **{key: value for key, value in stop.items() if key not in {"arrival", "departure"}},
            "arrival_at": _iso(stop["arrival"]),
            "departure_at": _iso(stop["departure"]),
        }


def _safe_timezone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def _day_bounds(day: date, timezone: ZoneInfo) -> tuple[datetime, datetime]:
    start = datetime.combine(day, time.min, tzinfo=timezone)
    return start.astimezone(UTC), (start + timedelta(days=1)).astimezone(UTC)


def _minute_in_day(value: datetime, timezone: ZoneInfo, day: date) -> int:
    local = value.astimezone(timezone)
    midnight = datetime.combine(day, time.min)
    wall_time = local.replace(tzinfo=None)
    return max(0, min(1440, round((wall_time - midnight).total_seconds() / 60)))


def _merge_segments(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    for segment in segments:
        if segment["end_minute"] <= segment["start_minute"]:
            continue
        if merged and merged[-1]["status"] == segment["status"]:
            merged[-1]["end_minute"] = segment["end_minute"]
            continue
        merged.append(dict(segment))
    return merged


def _cycle_at(
    events: list[dict[str, Any]],
    instant: datetime,
    initial_cycle_used: int,
) -> int:
    cycle = initial_cycle_used
    for event in events:
        if event["start"] >= instant:
            break
        if event["status"] in {DRIVING, ON_DUTY}:
            elapsed = min(event["end"], instant) - event["start"]
            cycle = event["cycle_used_before_minutes"] + round(elapsed.total_seconds() / 60)
        elif event["resets_cycle"] and event["end"] <= instant:
            cycle = 0
        else:
            cycle = event["cycle_used_before_minutes"]
        if event["end"] >= instant:
            break
        cycle = event["cycle_used_after_minutes"]
    return cycle


def build_daily_logs(
    *,
    events: list[dict[str, Any]],
    start_at: datetime,
    end_at: datetime,
    timezone_name: str,
    initial_cycle_used: int,
) -> list[dict[str, Any]]:
    timezone = _safe_timezone(timezone_name)
    first_day = start_at.astimezone(timezone).date()
    last_instant = end_at - timedelta(microseconds=1) if end_at > start_at else end_at
    last_day = last_instant.astimezone(timezone).date()
    day = first_day
    logs: list[dict[str, Any]] = []

    while day <= last_day:
        day_start, day_end = _day_bounds(day, timezone)
        overlapping = [
            event for event in events if event["end"] > day_start and event["start"] < day_end
        ]

        raw_segments: list[dict[str, Any]] = []
        cursor = 0
        for event in overlapping:
            segment_start = _minute_in_day(max(event["start"], day_start), timezone, day)
            segment_end = _minute_in_day(min(event["end"], day_end), timezone, day)
            if segment_start > cursor:
                raw_segments.append(
                    {
                        "status": OFF_DUTY,
                        "start_minute": cursor,
                        "end_minute": segment_start,
                        "source_event_id": None,
                    }
                )
            raw_segments.append(
                {
                    "status": event["status"],
                    "start_minute": segment_start,
                    "end_minute": segment_end,
                    "source_event_id": event["id"],
                }
            )
            cursor = max(cursor, segment_end)
        if cursor < 1440:
            raw_segments.append(
                {
                    "status": OFF_DUTY,
                    "start_minute": cursor,
                    "end_minute": 1440,
                    "source_event_id": None,
                }
            )
        segments = _merge_segments(raw_segments)
        if not segments:
            segments = [
                {
                    "status": OFF_DUTY,
                    "start_minute": 0,
                    "end_minute": 1440,
                    "source_event_id": None,
                }
            ]

        totals = {
            OFF_DUTY: 0,
            SLEEPER_BERTH: 0,
            DRIVING: 0,
            ON_DUTY: 0,
        }
        for segment in segments:
            totals[segment["status"]] += segment["end_minute"] - segment["start_minute"]

        remarks: list[dict[str, Any]] = []
        daily_distance = 0.0
        for event in overlapping:
            overlap_start = max(event["start"], day_start)
            overlap_end = min(event["end"], day_end)
            overlap_minutes = (overlap_end - overlap_start).total_seconds() / 60
            if event["status"] == DRIVING and event["duration_minutes"]:
                daily_distance += event["distance_meters"] * (
                    overlap_minutes / event["duration_minutes"]
                )
            minute = _minute_in_day(overlap_start, timezone, day)
            remarks.append(
                {
                    "minute": minute,
                    "time_label": _time_label(minute),
                    "location": event["location_start"],
                    "text": (
                        event["reason"]
                        if event["start"] >= day_start
                        else f"Continue {event['reason'].lower()}"
                    ),
                }
            )

        if overlapping:
            from_label = overlapping[0]["location_start"]
            to_label = overlapping[-1]["location_end"]
        else:
            from_label = to_label = "Off duty"

        cycle_at_end = _cycle_at(events, day_end, initial_cycle_used)
        restart_completed = any(
            event["resets_cycle"] and day_start < event["end"] <= day_end for event in events
        )
        on_duty_today = totals[DRIVING] + totals[ON_DUTY]

        logs.append(
            {
                "date": day.isoformat(),
                "timezone": timezone_name,
                "from": from_label,
                "to": to_label,
                "status_totals_minutes": totals,
                "status_totals_labels": {
                    status: _hours_label(minutes) for status, minutes in totals.items()
                },
                "segments": segments,
                "remarks": remarks,
                "driving_miles": round(daily_distance / METER_PER_MILE, 1),
                "recap": {
                    "on_duty_today_minutes": on_duty_today,
                    "cycle_used_end_minutes": cycle_at_end,
                    "cycle_remaining_minutes": max(0, CYCLE_LIMIT - cycle_at_end),
                    "restart_completed": restart_completed,
                    "estimated": True,
                },
                "form_fields": {
                    "driver_name": None,
                    "carrier_name": None,
                    "main_office_address": None,
                    "home_terminal_address": None,
                    "vehicle_ids": None,
                    "shipping_document_number": None,
                    "shipper_and_commodity": None,
                    "odometer_miles": None,
                },
            }
        )
        day += timedelta(days=1)

    return logs
