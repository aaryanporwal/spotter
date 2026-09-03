import json
from unittest.mock import patch

from django.test import SimpleTestCase

from planner.scheduler import METER_PER_MILE


class PlannerViewTests(SimpleTestCase):
    def setUp(self) -> None:
        self.resolved = {
            "current": {
                "input": "Dallas, TX",
                "display_name": "Dallas, TX",
                "lat": 32.8,
                "lng": -96.8,
                "timezone": "America/Chicago",
            },
            "pickup": {
                "input": "Fort Worth, TX",
                "display_name": "Fort Worth, TX",
                "lat": 32.75,
                "lng": -97.3,
                "timezone": "America/Chicago",
            },
            "dropoff": {
                "input": "Phoenix, AZ",
                "display_name": "Phoenix, AZ",
                "lat": 33.45,
                "lng": -112.1,
                "timezone": "America/Phoenix",
            },
        }
        first = round(30 * METER_PER_MILE)
        second = round(850 * METER_PER_MILE)
        self.route = {
            "distance_meters": first + second,
            "geometry": {
                "type": "LineString",
                "coordinates": [[-96.8, 32.8], [-97.3, 32.75], [-112.1, 33.45]],
            },
            "bbox": [-112.1, 32.75, -96.8, 33.45],
            "legs": [
                {
                    "kind": "current_to_pickup",
                    "distance_meters": first,
                    "driving_minutes": 35,
                    "start_label": "Dallas, TX",
                    "end_label": "Fort Worth, TX",
                    "steps": [],
                },
                {
                    "kind": "pickup_to_dropoff",
                    "distance_meters": second,
                    "driving_minutes": 930,
                    "start_label": "Fort Worth, TX",
                    "end_label": "Phoenix, AZ",
                    "steps": [],
                },
            ],
        }

    def test_health_identifies_django(self) -> None:
        response = self.client.get("/api/v1/health/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["stack"], "django")

    @patch("planner.views.suggest_locations")
    def test_suggest_location_returns_candidates(self, suggest) -> None:
        suggest.return_value = {
            "suggestions": [
                {"label": "Dallas, TX", "lat": 32.7763, "lng": -96.7969},
                {"label": "Dallas County, TX", "lat": 32.7, "lng": -96.8},
            ],
            "unsupported_country": False,
        }
        response = self.client.get("/api/v1/locations/suggest/?q=dallas")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload["suggestions"]), 2)
        self.assertFalse(payload["unsupported_country"])

    @patch("planner.views.suggest_locations")
    def test_suggest_location_flags_non_us_query(self, suggest) -> None:
        suggest.return_value = {"suggestions": [], "unsupported_country": True}
        response = self.client.get("/api/v1/locations/suggest/?q=mumbai")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["suggestions"], [])
        self.assertTrue(payload["unsupported_country"])

    @patch("planner.views.resolve_route")
    def test_plan_endpoint_returns_route_schedule_and_logs(self, resolver) -> None:
        resolver.return_value = (self.resolved, self.route, "America/Chicago")
        response = self.client.post(
            "/api/v1/trips/plan/",
            data=json.dumps(
                {
                    "current_location": "Dallas, TX",
                    "pickup_location": "Fort Worth, TX",
                    "dropoff_location": "Phoenix, AZ",
                    "current_cycle_used_hours": 12.5,
                    "start_at": "2026-09-03T08:00:00-05:00",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["resolved_locations"]["pickup"]["display_name"], "Fort Worth, TX")
        self.assertEqual(payload["summary"]["cycle_used_start_minutes"], 750)
        self.assertGreater(payload["summary"]["daily_log_count"], 0)
        self.assertEqual(payload["route"]["geometry"]["type"], "LineString")
        self.assertEqual(payload["route"]["overview"], "simplified")
        self.assertEqual(resolver.call_args.kwargs["overview"], "simplified")
        self.assertEqual(payload["assumptions"][0]["code"], "property_carrier_70_8")
        self.assertEqual(payload["warnings"][0]["code"], "STANDARD_ROAD_PROFILE")
        self.assertEqual(payload["timezone"], "America/Chicago")

    @patch("planner.views.resolve_route")
    def test_plan_endpoint_passes_full_route_overview(self, resolver) -> None:
        full_route = {**self.route, "overview": "full"}
        resolver.return_value = (self.resolved, full_route, "America/Chicago")
        response = self.client.post(
            "/api/v1/trips/plan/",
            data=json.dumps(
                {
                    "current_location": "Dallas, TX",
                    "pickup_location": "Fort Worth, TX",
                    "dropoff_location": "Phoenix, AZ",
                    "current_cycle_used_hours": 0,
                    "route_overview": "full",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(resolver.call_args.kwargs["overview"], "full")
        self.assertEqual(response.json()["route"]["overview"], "full")

    def test_plan_endpoint_returns_field_error(self) -> None:
        response = self.client.post(
            "/api/v1/trips/plan/",
            data=json.dumps(
                {
                    "current_location": "Dallas, TX",
                    "pickup_location": "Fort Worth, TX",
                    "dropoff_location": "Phoenix, AZ",
                    "current_cycle_used_hours": 71,
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        payload = response.json()["error"]
        self.assertEqual(payload["field"], "current_cycle_used_hours")
        self.assertEqual(
            payload["fields"]["current_cycle_used_hours"],
            "Cycle hours must be between 0 and 70.",
        )
