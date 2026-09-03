import type {
  ApiErrorEnvelope,
  DailyLog,
  DutyEvent,
  DutyStatus,
  LogRemark,
  LogSegment,
  ResolvedLocation,
  RouteLeg,
  RouteStep,
  StopType,
  TripFieldErrors,
  TripPlan,
  TripPlanRequest,
  TripStop,
} from "@/types/trip"

type UnknownRecord = Record<string, unknown>

export class TripPlanError extends Error {
  readonly status: number
  readonly code?: string
  readonly fields: TripFieldErrors

  constructor(
    message: string,
    options: { status: number; code?: string; fields?: TripFieldErrors },
  ) {
    super(message)
    this.name = "TripPlanError"
    this.status = options.status
    this.code = options.code
    this.fields = options.fields ?? {}
  }
}

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object"
    ? (value as UnknownRecord)
    : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function numberFrom(source: UnknownRecord, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return fallback
}

function stringFrom(source: UnknownRecord, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === "string") return value
  }
  return fallback
}

function normalizeStatus(value: unknown): DutyStatus {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[ -]+/g, "_")
  if (normalized === "sleeper_berth") return "sleeper_berth"
  if (normalized === "driving") return "driving"
  if (
    normalized === "on_duty_not_driving" ||
    normalized === "on_duty_(not_driving)" ||
    normalized === "on_duty"
  ) {
    return "on_duty_not_driving"
  }
  return "off_duty"
}

function normalizeStopType(value: unknown): StopType {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[ -]+/g, "_")
  const allowed: StopType[] = [
    "start",
    "pickup",
    "break",
    "fuel",
    "daily_rest",
    "cycle_restart",
    "dropoff",
  ]
  return allowed.includes(normalized as StopType)
    ? (normalized as StopType)
    : "break"
}

function normalizeLocation(value: unknown): ResolvedLocation | undefined {
  const source = record(value)
  const latitude = numberFrom(source, ["latitude", "lat"], Number.NaN)
  const longitude = numberFrom(source, ["longitude", "lng", "lon"], Number.NaN)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined
  return {
    label: stringFrom(source, ["label", "display_name", "name", "query"]),
    address: stringFrom(source, ["address", "display_name"]) || undefined,
    latitude,
    longitude,
  }
}

function normalizeStop(value: unknown, index: number): TripStop {
  const source = record(value)
  const location = record(source.location)
  return {
    id: stringFrom(source, ["id"], `stop-${index + 1}`),
    sequence: numberFrom(source, ["sequence"], index + 1),
    type: normalizeStopType(source.type),
    label: stringFrom(source, ["label", "location_label"], "Planned stop"),
    latitude: numberFrom(
      source,
      ["latitude", "lat"],
      numberFrom(location, ["latitude", "lat"]),
    ),
    longitude: numberFrom(
      source,
      ["longitude", "lng", "lon"],
      numberFrom(location, ["longitude", "lng", "lon"]),
    ),
    arrivalAt: stringFrom(source, ["arrival_at", "arrivalAt"]),
    departureAt: stringFrom(source, ["departure_at", "departureAt"]),
    durationMinutes: numberFrom(source, ["duration_minutes", "durationMinutes"]),
    cumulativeMiles: numberFrom(source, [
      "route_mile",
      "cumulative_miles",
      "cumulativeMiles",
    ]),
    dutyStatus: normalizeStatus(source.duty_status ?? source.status),
    note: stringFrom(source, ["reason", "note", "description"]),
  }
}

function normalizeSegment(value: unknown): LogSegment {
  const source = record(value)
  const startMinute = Math.max(
    0,
    Math.min(1440, numberFrom(source, ["start_minute", "startMinute"])),
  )
  const endMinute = Math.max(
    startMinute,
    Math.min(1440, numberFrom(source, ["end_minute", "endMinute"])),
  )
  return {
    startMinute,
    endMinute,
    status: normalizeStatus(source.status),
    activity: stringFrom(source, ["activity"]),
    distanceMiles: numberFrom(source, ["distance_miles", "distanceMiles"]),
  }
}

function normalizeRemark(value: unknown): LogRemark {
  const source = record(value)
  return {
    minute: Math.max(0, Math.min(1440, numberFrom(source, ["minute"]))),
    label: stringFrom(source, ["text", "label", "activity"]),
    location: stringFrom(source, ["location", "location_label"]),
  }
}

function normalizeDailyLog(value: unknown): DailyLog {
  const source = record(value)
  const totals = record(
    source.status_totals_minutes ?? source.totals_minutes ?? source.totals,
  )
  const recap = record(source.recap)
  const formFields = record(source.form_fields)
  return {
    date: stringFrom(source, ["date"]),
    timezone: stringFrom(source, ["timezone"]),
    from: stringFrom(source, ["from"]),
    to: stringFrom(source, ["to"]),
    totalMiles: numberFrom(source, ["driving_miles", "total_miles", "totalMiles"]),
    totalsMinutes: {
      offDuty: numberFrom(totals, ["off_duty", "offDuty"]),
      sleeperBerth: numberFrom(totals, ["sleeper_berth", "sleeperBerth"]),
      driving: numberFrom(totals, ["driving"]),
      onDutyNotDriving: numberFrom(totals, [
        "on_duty_not_driving",
        "onDutyNotDriving",
      ]),
    },
    segments: array(source.segments)
      .map(normalizeSegment)
      .filter((segment) => segment.endMinute > segment.startMinute),
    remarks: array(source.remarks).map(normalizeRemark),
    recap:
      Object.keys(recap).length > 0
        ? {
            onDutyTodayMinutes: numberFrom(recap, ["on_duty_today_minutes"]),
            cycleUsedEndMinutes: numberFrom(recap, ["cycle_used_end_minutes"]),
            cycleRemainingMinutes: numberFrom(recap, ["cycle_remaining_minutes"]),
            restartCompleted: recap.restart_completed === true,
            estimated: recap.estimated !== false,
          }
        : undefined,
    formFields: Object.keys(formFields).length
      ? (formFields as Record<string, string | number | null>)
      : undefined,
  }
}

function normalizeRouteLeg(value: unknown): RouteLeg {
  const source = record(value)
  const distanceMeters = numberFrom(source, ["distance_meters"], Number.NaN)
  return {
    from: stringFrom(source, ["from", "from_label", "kind"]),
    to: stringFrom(source, ["to", "to_label"]),
    distanceMiles: numberFrom(
      source,
      ["distance_miles", "distanceMiles"],
      Number.isFinite(distanceMeters) ? distanceMeters / 1609.344 : 0,
    ),
    durationMinutes: numberFrom(source, [
      "driving_minutes",
      "duration_minutes",
      "durationMinutes",
    ]),
  }
}

function normalizeRouteStep(value: unknown): RouteStep {
  const source = record(value)
  const distanceMeters = numberFrom(source, ["distance_meters"], Number.NaN)
  return {
    instruction: stringFrom(source, ["instruction", "name"], "Continue on route"),
    distanceMiles: numberFrom(
      source,
      ["distance_miles", "distanceMiles"],
      Number.isFinite(distanceMeters) ? distanceMeters / 1609.344 : 0,
    ),
    durationMinutes: numberFrom(source, ["duration_minutes", "durationMinutes"]),
  }
}

function normalizeDutyEvent(value: unknown, index: number): DutyEvent {
  const source = record(value)
  return {
    id: stringFrom(source, ["id"], `event-${index + 1}`),
    startAt: stringFrom(source, ["start_at", "startAt"]),
    endAt: stringFrom(source, ["end_at", "endAt"]),
    status: normalizeStatus(source.status),
    activity: stringFrom(source, ["activity"]),
    locationLabel: stringFrom(source, ["location_label", "locationLabel"]),
    distanceMiles: numberFrom(source, ["distance_miles", "distanceMiles"]),
  }
}

function normalizeCoordinates(value: unknown): [number, number][] {
  const geometry = record(value)
  return array(geometry.coordinates)
    .map((point): [number, number] | null => {
      if (!Array.isArray(point) || point.length < 2) return null
      const longitude = Number(point[0])
      const latitude = Number(point[1])
      return Number.isFinite(latitude) && Number.isFinite(longitude)
        ? [latitude, longitude]
        : null
    })
    .filter((point): point is [number, number] => point !== null)
}

function stringArray(value: unknown): string[] {
  return array(value).flatMap((item) => {
    if (typeof item === "string") return [item]
    const message = stringFrom(record(item), ["message"])
    return message ? [message] : []
  })
}

export function normalizeTripPlan(value: unknown): TripPlan {
  const source = record(value)
  const summary = record(source.summary)
  const route = record(source.route)
  const resolved = record(source.resolved_locations)
  const dailyLogs = array(source.daily_logs ?? source.log_days).map(normalizeDailyLog)
  const stops = array(source.stops).map(normalizeStop)
  const distanceMeters = numberFrom(summary, ["distance_meters"], Number.NaN)
  const cycleUsedStartMinutes = numberFrom(
    summary,
    ["cycle_used_start_minutes"],
    Number.NaN,
  )
  const routeLegsRaw = array(route.legs)
  const nestedSteps = routeLegsRaw.flatMap((leg) => array(record(leg).steps))
  const resolvedLocations = {
    current: normalizeLocation(
      resolved.current ?? resolved.current_location ?? resolved.origin,
    ),
    pickup: normalizeLocation(resolved.pickup ?? resolved.pickup_location),
    dropoff: normalizeLocation(resolved.dropoff ?? resolved.dropoff_location),
  }

  return {
    summary: {
      distanceMiles: numberFrom(summary, [
        "total_distance_miles",
        "distance_miles",
      ], Number.isFinite(distanceMeters) ? distanceMeters / 1609.344 : 0),
      drivingMinutes: numberFrom(summary, [
        "total_driving_minutes",
        "route_driving_minutes",
        "driving_minutes",
      ]),
      elapsedMinutes: numberFrom(summary, [
        "total_trip_minutes",
        "trip_elapsed_minutes",
        "elapsed_minutes",
      ]),
      eta: stringFrom(summary, ["delivery_at", "estimated_arrival_at", "eta"]),
      cycleUsedStartHours: numberFrom(summary, [
        "cycle_used_start_hours",
        "current_cycle_used_hours",
      ], Number.isFinite(cycleUsedStartMinutes) ? cycleUsedStartMinutes / 60 : 0),
      fuelStops: numberFrom(
        summary,
        ["fuel_stop_count", "fuel_stops"],
        stops.filter((stop) => stop.type === "fuel").length,
      ),
      restStops: numberFrom(
        summary,
        ["rest_stop_count", "rest_stops"],
        stops.filter(
          (stop) =>
            stop.type === "break" ||
            stop.type === "daily_rest" ||
            stop.type === "cycle_restart",
        ).length,
      ),
      logDays: numberFrom(summary, ["daily_log_count", "log_days"], dailyLogs.length),
      startAt: stringFrom(summary, ["start_at"]),
      pickupAt: stringFrom(summary, ["pickup_at"]),
      cycleRemainingMinutes: numberFrom(summary, ["cycle_remaining_minutes"]),
    },
    timezone: stringFrom(
      source,
      ["timezone", "log_timezone"],
      dailyLogs[0]?.timezone ?? "UTC",
    ),
    routeCoordinates: normalizeCoordinates(route.geometry),
    routeLegs: routeLegsRaw.map(normalizeRouteLeg),
    routeSteps: array(route.steps).length
      ? array(route.steps).map(normalizeRouteStep)
      : nestedSteps.map(normalizeRouteStep),
    stops,
    dutyEvents: array(source.duty_events ?? source.schedule).map(normalizeDutyEvent),
    dailyLogs,
    assumptions: stringArray(source.assumptions),
    warnings: stringArray(source.warnings),
    resolvedLocations,
  }
}

function normalizeFieldErrors(value: unknown): TripFieldErrors {
  const source = record(value)
  const allowed = [
    "current_location",
    "pickup_location",
    "dropoff_location",
    "current_cycle_used_hours",
  ] as const
  return Object.fromEntries(
    allowed.flatMap((key) => {
      const raw = source[key]
      if (typeof raw === "string") return [[key, raw]]
      if (Array.isArray(raw) && typeof raw[0] === "string") return [[key, raw[0]]]
      return []
    }),
  ) as TripFieldErrors
}

async function readError(response: Response): Promise<TripPlanError> {
  let payload: ApiErrorEnvelope = {}
  try {
    payload = (await response.json()) as ApiErrorEnvelope
  } catch {
    // A proxy or upstream can return an empty/non-JSON error page.
  }
  const nested = typeof payload.error === "object" ? payload.error : undefined
  const message =
    nested?.message ??
    (typeof payload.error === "string" ? payload.error : undefined) ??
    payload.detail ??
    (response.status >= 500
      ? "The route service is temporarily unavailable. Please try again."
      : "We couldn’t build this trip. Check the locations and try again.")
  const fields = normalizeFieldErrors({
    ...(nested?.field && nested.message ? { [nested.field]: nested.message } : {}),
    ...nested?.fields,
  })
  return new TripPlanError(message, {
    status: response.status,
    code: nested?.code,
    fields,
  })
}

export async function planTrip(
  request: TripPlanRequest,
  signal?: AbortSignal,
): Promise<TripPlan> {
  const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
    /\/$/,
    "",
  )
  const response = await fetch(`${apiBase ?? ""}/api/v1/trips/plan/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(request),
    signal,
  })
  if (!response.ok) throw await readError(response)
  return normalizeTripPlan(await response.json())
}
