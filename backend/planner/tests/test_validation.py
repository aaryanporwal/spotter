from django.test import SimpleTestCase

from planner.errors import PlannerError
from planner.validation import validate_plan_request


class RequestValidationTests(SimpleTestCase):
    def test_accepts_string_locations_and_fractional_cycle(self) -> None:
        result = validate_plan_request(
            {
                "current_location": "Dallas, TX",
                "pickup_location": "Fort Worth, TX",
                "dropoff_location": "Phoenix, AZ",
                "current_cycle_used_hours": 42.5,
                "start_at": "2026-09-03T08:00:00-05:00",
            }
        )

        self.assertEqual(result["current_location"]["query"], "Dallas, TX")
        self.assertEqual(result["current_cycle_used_minutes"], 2550)

    def test_rejects_cycle_over_seventy(self) -> None:
        with self.assertRaises(PlannerError) as context:
            validate_plan_request(
                {
                    "current_location": "Dallas, TX",
                    "pickup_location": "Fort Worth, TX",
                    "dropoff_location": "Phoenix, AZ",
                    "current_cycle_used_hours": 70.1,
                }
            )

        self.assertEqual(context.exception.field, "current_cycle_used_hours")
        self.assertEqual(context.exception.status, 400)

    def test_accepts_pre_resolved_coordinates(self) -> None:
        result = validate_plan_request(
            {
                "current_location": {"lat": 32.8, "lng": -96.8, "label": "Dallas, TX"},
                "pickup_location": {"lat": 32.75, "lng": -97.3, "label": "Fort Worth, TX"},
                "dropoff_location": {"lat": 33.45, "lng": -112.1, "label": "Phoenix, AZ"},
                "current_cycle_used_hours": 0,
            }
        )

        self.assertEqual(result["pickup_location"]["lat"], 32.75)
