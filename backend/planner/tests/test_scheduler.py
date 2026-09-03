from __future__ import annotations

from datetime import UTC, datetime

from django.test import SimpleTestCase

from planner.scheduler import (
    BREAK_DRIVE_LIMIT,
    CYCLE_LIMIT,
    CYCLE_RESTART,
    DAILY_RESET,
    DRIVING,
    METER_PER_MILE,
    OFF_DUTY,
    ON_DUTY,
    Location,
    TripScheduler,
)


def synthetic_route(
    *,
    first_drive_minutes: int,
    second_drive_minutes: int,
    first_miles: float | None = None,
    second_miles: float | None = None,
) -> dict:
    first_miles = first_miles if first_miles is not None else first_drive_minutes * 55 / 60
    second_miles = second_miles if second_miles is not None else second_drive_minutes * 55 / 60
    first_distance = round(first_miles * METER_PER_MILE)
    second_distance = round(second_miles * METER_PER_MILE)
    return {
        "distance_meters": first_distance + second_distance,
        "geometry": {
            "type": "LineString",
            "coordinates": [[-96.8, 32.8], [-97.3, 32.75], [-112.1, 33.45]],
        },
        "legs": [
            {
                "kind": "current_to_pickup",
                "distance_meters": first_distance,
                "driving_minutes": first_drive_minutes,
                "start_label": "Dallas, TX",
                "end_label": "Fort Worth, TX",
                "steps": [],
            },
            {
                "kind": "pickup_to_dropoff",
                "distance_meters": second_distance,
                "driving_minutes": second_drive_minutes,
                "start_label": "Fort Worth, TX",
                "end_label": "Phoenix, AZ",
                "steps": [],
            },
        ],
    }


def build_plan(
    *,
    first_drive_minutes: int,
    second_drive_minutes: int,
    cycle_hours: float = 0,
    start_at: datetime | None = None,
    first_miles: float | None = None,
    second_miles: float | None = None,
) -> dict:
    route = synthetic_route(
        first_drive_minutes=first_drive_minutes,
        second_drive_minutes=second_drive_minutes,
        first_miles=first_miles,
        second_miles=second_miles,
    )
    return TripScheduler(
        route=route,
        current=Location("Dallas, TX", 32.8, -96.8),
        pickup=Location("Fort Worth, TX", 32.75, -97.3),
        dropoff=Location("Phoenix, AZ", 33.45, -112.1),
        start_at=start_at or datetime(2026, 9, 3, 8, tzinfo=UTC),
        current_cycle_used_minutes=round(cycle_hours * 60),
        log_timezone="UTC",
    ).build()


class TripSchedulerTests(SimpleTestCase):
    def test_short_trip_has_only_required_service_stops(self) -> None:
        result = build_plan(first_drive_minutes=120, second_drive_minutes=300)

        stop_types = [stop["type"] for stop in result["stops"]]
        self.assertEqual(stop_types, ["start", "pickup", "dropoff"])
        self.assertEqual(result["summary"]["driving_minutes"], 420)
        service_events = [event for event in result["duty_events"] if event["status"] == ON_DUTY]
        self.assertEqual([event["duration_minutes"] for event in service_events], [60, 60])
        totals = result["daily_logs"][0]["status_totals_minutes"]
        self.assertEqual(totals[DRIVING], 420)
        self.assertEqual(totals[ON_DUTY], 120)
        self.assertEqual(sum(totals.values()), 1440)
        self.assertEqual(result["daily_logs"][0]["timezone"], "UTC")

    def test_break_is_added_after_eight_hours_since_pickup(self) -> None:
        result = build_plan(first_drive_minutes=0, second_drive_minutes=540)

        breaks = [stop for stop in result["stops"] if stop["type"] == "break"]
        self.assertEqual(len(breaks), 1)
        self.assertEqual(breaks[0]["duration_minutes"], 30)
        events = result["duty_events"]
        pickup_index = next(
            index for index, event in enumerate(events) if event["reason"] == "Pickup"
        )
        driving_after_pickup = 0
        for event in events[pickup_index + 1 :]:
            if event["reason"] == "30-minute HOS break":
                break
            if event["status"] == DRIVING:
                driving_after_pickup += event["duration_minutes"]
        self.assertEqual(driving_after_pickup, BREAK_DRIVE_LIMIT)

    def test_pickup_itself_satisfies_break(self) -> None:
        result = build_plan(first_drive_minutes=480, second_drive_minutes=60)

        self.assertFalse(any(stop["type"] == "break" for stop in result["stops"]))

    def test_eleven_hour_limit_creates_ten_hour_reset(self) -> None:
        result = build_plan(first_drive_minutes=0, second_drive_minutes=14 * 60)

        rests = [stop for stop in result["stops"] if stop["type"] == "daily_rest"]
        self.assertEqual(len(rests), 1)
        self.assertEqual(rests[0]["duration_minutes"], DAILY_RESET)
        driving_chunks = [
            event["duration_minutes"]
            for event in result["duty_events"]
            if event["status"] == DRIVING
        ]
        self.assertEqual(sum(driving_chunks), 14 * 60)

    def test_cycle_exhaustion_inserts_34_hour_restart(self) -> None:
        result = build_plan(
            first_drive_minutes=0,
            second_drive_minutes=180,
            cycle_hours=68,
        )

        restart = next(stop for stop in result["stops"] if stop["type"] == "cycle_restart")
        self.assertEqual(restart["duration_minutes"], CYCLE_RESTART)
        self.assertEqual(result["summary"]["cycle_used_end_minutes"], 180)

    def test_fuel_is_added_at_each_thousand_miles(self) -> None:
        result = build_plan(
            first_drive_minutes=0,
            second_drive_minutes=2250,
            second_miles=2050,
        )

        fuel_stops = [stop for stop in result["stops"] if stop["type"] == "fuel"]
        self.assertEqual(len(fuel_stops), 2)
        self.assertLessEqual(fuel_stops[0]["route_mile"], 1000.1)
        self.assertLessEqual(fuel_stops[1]["route_mile"] - fuel_stops[0]["route_mile"], 1000.1)
        self.assertEqual([stop["duration_minutes"] for stop in fuel_stops], [30, 30])

    def test_exact_break_boundary_at_trip_end_adds_no_break(self) -> None:
        exact = build_plan(first_drive_minutes=0, second_drive_minutes=480)
        over = build_plan(first_drive_minutes=0, second_drive_minutes=481)

        self.assertFalse(any(stop["type"] == "break" for stop in exact["stops"]))
        self.assertTrue(any(stop["type"] == "break" for stop in over["stops"]))

    def test_midnight_service_splits_daily_logs(self) -> None:
        result = build_plan(
            first_drive_minutes=0,
            second_drive_minutes=0,
            start_at=datetime(2026, 9, 3, 23, 30, tzinfo=UTC),
        )

        self.assertEqual(len(result["daily_logs"]), 2)
        self.assertEqual(
            [log["status_totals_minutes"][ON_DUTY] for log in result["daily_logs"]],
            [30, 90],
        )
        self.assertTrue(
            all(sum(log["status_totals_minutes"].values()) == 1440 for log in result["daily_logs"])
        )

    def test_schedule_invariants_hold_on_long_trip(self) -> None:
        result = build_plan(
            first_drive_minutes=180,
            second_drive_minutes=2400,
            cycle_hours=51.5,
            first_miles=160,
            second_miles=2200,
        )

        uninterrupted_drive = 0
        shift_drive = 0
        for event in result["duty_events"]:
            if event["status"] == DRIVING:
                uninterrupted_drive += event["duration_minutes"]
                shift_drive += event["duration_minutes"]
                self.assertLessEqual(uninterrupted_drive, BREAK_DRIVE_LIMIT)
            elif event["duration_minutes"] >= 30:
                uninterrupted_drive = 0
            if event["status"] == OFF_DUTY and event["duration_minutes"] >= DAILY_RESET:
                self.assertLessEqual(shift_drive, 11 * 60)
                shift_drive = 0
        self.assertLessEqual(shift_drive, 11 * 60)
        self.assertGreaterEqual(result["summary"]["cycle_remaining_minutes"], 0)
        self.assertLessEqual(result["summary"]["cycle_used_end_minutes"], CYCLE_LIMIT)
        self.assertTrue(
            all(sum(log["status_totals_minutes"].values()) == 1440 for log in result["daily_logs"])
        )
        displayed_daily_miles = sum(log["driving_miles"] for log in result["daily_logs"])
        self.assertAlmostEqual(
            displayed_daily_miles,
            result["summary"]["distance_meters"] / METER_PER_MILE,
            delta=0.2 * len(result["daily_logs"]),
        )
