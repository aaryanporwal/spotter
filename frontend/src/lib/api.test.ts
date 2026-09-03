import { describe, expect, it } from "vitest"

import { normalizeTripPlan } from "@/lib/api"

describe("normalizeTripPlan", () => {
  it("maps the backend snake_case contract into the UI model", () => {
    const plan = normalizeTripPlan({
      timezone: "America/Chicago",
      log_timezone: "America/Chicago",
      summary: {
        distance_meters: 160934,
        driving_minutes: 180,
        elapsed_minutes: 240,
        delivery_at: "2026-09-03T20:00:00Z",
        daily_log_count: 1,
        fuel_stop_count: 0,
        rest_stop_count: 1,
        cycle_used_start_minutes: 750,
        cycle_remaining_minutes: 3450,
      },
      resolved_locations: {
        current: { display_name: "Dallas, TX", lat: 32.8, lng: -96.8 },
      },
      route: {
        geometry: { type: "LineString", coordinates: [[-96.8, 32.8], [-97.3, 32.75]] },
        legs: [
          {
            kind: "current_to_pickup",
            distance_meters: 48280,
            driving_minutes: 40,
            steps: [{ instruction: "Head west", distance_meters: 1609, duration_minutes: 2 }],
          },
        ],
      },
      stops: [
        {
          id: "stop-1",
          sequence: 1,
          type: "start",
          label: "Dallas, TX",
          lat: 32.8,
          lng: -96.8,
          arrival_at: "2026-09-03T13:00:00Z",
          departure_at: "2026-09-03T13:00:00Z",
          duration_minutes: 0,
          route_mile: 0,
          duty_status: "off_duty",
          reason: "Trip starts",
        },
      ],
      duty_events: [],
      daily_logs: [
        {
          date: "2026-09-03",
          timezone: "America/Chicago",
          from: "Dallas, TX",
          to: "Fort Worth, TX",
          driving_miles: 30,
          status_totals_minutes: {
            off_duty: 1260,
            sleeper_berth: 0,
            driving: 120,
            on_duty_not_driving: 60,
          },
          segments: [{ start_minute: 0, end_minute: 1440, status: "off_duty" }],
          remarks: [{ minute: 480, text: "Pickup", location: "Fort Worth, TX" }],
        },
      ],
      assumptions: [{ message: "Fresh 11-hour driving clock." }],
      warnings: [{ message: "Planning estimates, not certified ELD records." }],
    })

    expect(plan.summary.distanceMiles).toBeCloseTo(100)
    expect(plan.summary.cycleUsedStartHours).toBe(12.5)
    expect(plan.routeCoordinates[0]).toEqual([32.8, -96.8])
    expect(plan.routeSteps[0]?.instruction).toBe("Head west")
    expect(plan.stops[0]?.type).toBe("start")
    expect(plan.dailyLogs[0]?.totalsMinutes.driving).toBe(120)
    expect(plan.assumptions[0]).toContain("Fresh 11-hour")
    expect(plan.warnings[0]).toContain("Planning estimates")
  })
})
