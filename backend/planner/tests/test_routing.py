from unittest.mock import patch

from django.test import SimpleTestCase

from planner import routing
from planner.errors import PlannerError
from planner.routing import (
    US_ONLY_MESSAGE,
    _geocode,
    _photon_label,
    resolve_route,
    suggest_locations,
)


def _photon_feature(
    name: str,
    countrycode: str,
    lng: float,
    lat: float,
    *,
    city: str | None = None,
    state: str | None = None,
    street: str | None = None,
    housenumber: str | None = None,
    postcode: str | None = None,
) -> dict:
    properties = {"name": name, "countrycode": countrycode}
    if city:
        properties["city"] = city
    if state:
        properties["state"] = state
    if street:
        properties["street"] = street
    if housenumber:
        properties["housenumber"] = housenumber
    if postcode:
        properties["postcode"] = postcode
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lng, lat]},
        "properties": properties,
    }


class PhotonLabelTests(SimpleTestCase):
    def test_city_uses_state_abbrev_without_duplicating_name(self) -> None:
        self.assertEqual(
            _photon_label({"name": "Dallas", "city": "Dallas", "state": "Texas"}),
            "Dallas, TX",
        )

    def test_street_number_becomes_expanded_address(self) -> None:
        self.assertEqual(
            _photon_label(
                {
                    "name": "Main Street",
                    "housenumber": "123",
                    "street": "Main Street",
                    "city": "Nashville",
                    "state": "Tennessee",
                    "postcode": "37203",
                }
            ),
            "123 Main Street, Nashville, TN 37203",
        )


class LocationCountryTests(SimpleTestCase):
    def setUp(self) -> None:
        routing._suggest_cache.clear()
        routing._geocode_cache.clear()

    @patch("planner.routing._get_json")
    def test_suggest_keeps_only_us_results(self, get_json) -> None:
        get_json.return_value = {
            "features": [
                _photon_feature("Dallas", "US", -96.7969, 32.7767, city="Dallas", state="Texas"),
                _photon_feature("Dallas", "CA", -96.8, 49.7, city="Manitoba"),
            ]
        }

        result = suggest_locations("dallas")

        self.assertFalse(result["unsupported_country"])
        self.assertEqual(result["suggestions"][0]["label"], "Dallas, TX")
        self.assertEqual(len(result["suggestions"]), 1)

    @patch("planner.routing._get_json")
    def test_suggest_flags_non_us_query(self, get_json) -> None:
        get_json.return_value = {
            "features": [
                _photon_feature("Mumbai", "IN", 72.8777, 19.076, state="Maharashtra"),
                _photon_feature("Mumbai Suburban District", "IN", 72.83, 19.05),
            ]
        }

        result = suggest_locations("mumbai")

        self.assertEqual(result["suggestions"], [])
        self.assertTrue(result["unsupported_country"])

    @patch("planner.routing._get_json")
    def test_suggest_keeps_us_rows_from_mixed_query(self, get_json) -> None:
        get_json.return_value = {
            "features": [
                _photon_feature("Paris", "FR", 2.3522, 48.8566, state="Île-de-France"),
                _photon_feature("Paris", "US", -95.5555, 33.6609, city="Paris", state="Texas"),
            ]
        }

        result = suggest_locations("paris")

        self.assertFalse(result["unsupported_country"])
        self.assertEqual(result["suggestions"][0]["label"], "Paris, TX")

    @patch("planner.routing._get_json")
    def test_suggest_expands_street_address(self, get_json) -> None:
        get_json.return_value = {
            "features": [
                _photon_feature(
                    "Dallas Love Field",
                    "US",
                    -96.8518,
                    32.8471,
                    city="Dallas",
                    state="Texas",
                    street="Cedar Springs Road",
                    housenumber="8008",
                    postcode="75235",
                )
            ]
        }

        result = suggest_locations("love field")

        self.assertEqual(
            result["suggestions"][0]["label"],
            "Dallas Love Field, 8008 Cedar Springs Road, Dallas, TX 75235",
        )

    def test_geocode_rejects_non_us_coordinates(self) -> None:
        with self.assertRaises(PlannerError) as context:
            _geocode(
                {
                    "query": "Mumbai",
                    "label": "Mumbai, Maharashtra",
                    "lat": 19.076,
                    "lng": 72.8777,
                },
                field="pickup_location",
            )

        self.assertEqual(context.exception.code, "UNSUPPORTED_COUNTRY")
        self.assertEqual(context.exception.message, US_ONLY_MESSAGE)
        self.assertEqual(context.exception.field, "pickup_location")

    def test_geocode_accepts_us_coordinates(self) -> None:
        result = _geocode(
            {
                "query": "Dallas, TX",
                "label": "Dallas, TX",
                "lat": 32.7767,
                "lng": -96.797,
            },
            field="current_location",
        )

        self.assertEqual(result["lat"], 32.7767)
        self.assertEqual(result["timezone"], "America/Chicago")

    @patch("planner.routing._get_json")
    def test_geocode_rejects_non_us_nominatim_match(self, get_json) -> None:
        get_json.return_value = [
            {
                "lat": "19.076",
                "lon": "72.8777",
                "display_name": "Mumbai, Maharashtra, India",
                "address": {"city": "Mumbai", "country_code": "in"},
            }
        ]

        with self.assertRaises(PlannerError) as context:
            _geocode({"query": "Mumbai"}, field="current_location")

        self.assertEqual(context.exception.code, "UNSUPPORTED_COUNTRY")
        self.assertEqual(context.exception.message, US_ONLY_MESSAGE)

    @patch("planner.routing._get_json")
    def test_geocode_accepts_us_nominatim_match(self, get_json) -> None:
        get_json.return_value = [
            {
                "lat": "32.7767",
                "lon": "-96.797",
                "display_name": "Dallas, Dallas County, Texas, United States",
                "address": {
                    "city": "Dallas",
                    "state": "Texas",
                    "ISO3166-2-lvl4": "US-TX",
                    "country_code": "us",
                },
            }
        ]

        result = _geocode({"query": "Dallas, TX"}, field="current_location")

        self.assertEqual(result["display_name"], "Dallas, TX")
        self.assertEqual(result["timezone"], "America/Chicago")


def _resolved_points() -> dict[str, dict]:
    return {
        "current_value": {"query": "Dallas", "label": "Dallas, TX", "lat": 32.8, "lng": -96.8},
        "pickup_value": {
            "query": "Fort Worth",
            "label": "Fort Worth, TX",
            "lat": 32.75,
            "lng": -97.3,
        },
        "dropoff_value": {
            "query": "Phoenix",
            "label": "Phoenix, AZ",
            "lat": 33.45,
            "lng": -112.1,
        },
    }


def _osrm_payload() -> dict:
    return {
        "code": "Ok",
        "routes": [
            {
                "distance": 1000,
                "duration": 120,
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[-96.8, 32.8], [-97.3, 32.75], [-112.1, 33.45]],
                },
                "legs": [
                    {"distance": 400, "duration": 40, "steps": []},
                    {"distance": 600, "duration": 80, "steps": []},
                ],
            }
        ],
    }


class RouteOverviewTests(SimpleTestCase):
    def setUp(self) -> None:
        routing._geocode_cache.clear()

    @patch("planner.routing._get_json")
    def test_requests_simplified_overview_by_default(self, get_json) -> None:
        get_json.side_effect = [{"timeZone": "America/Chicago"}, _osrm_payload()]

        _, route, _ = resolve_route(**_resolved_points())

        self.assertEqual(get_json.call_args.kwargs["params"]["overview"], "simplified")
        self.assertEqual(route["overview"], "simplified")

    @patch("planner.routing._get_json")
    def test_requests_full_overview_when_asked(self, get_json) -> None:
        get_json.side_effect = [{"timeZone": "America/Chicago"}, _osrm_payload()]

        _, route, _ = resolve_route(**_resolved_points(), overview="full")

        self.assertEqual(get_json.call_args.kwargs["params"]["overview"], "full")
        self.assertEqual(route["overview"], "full")
