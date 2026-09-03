export type DutyStatus =
  | "off_duty"
  | "sleeper_berth"
  | "driving"
  | "on_duty_not_driving"

export type StopType =
  | "start"
  | "pickup"
  | "break"
  | "fuel"
  | "daily_rest"
  | "cycle_restart"
  | "dropoff"

export interface TripPlanRequest {
  current_location: string
  pickup_location: string
  dropoff_location: string
  current_cycle_used_hours: number
  start_at?: string
}

export interface Coordinates {
  latitude: number
  longitude: number
}

export interface ResolvedLocation extends Coordinates {
  label: string
  address?: string
}

export interface PlanSummary {
  distanceMiles: number
  drivingMinutes: number
  elapsedMinutes: number
  eta: string
  cycleUsedStartHours: number
  fuelStops: number
  restStops: number
  logDays: number
  startAt: string
  pickupAt: string
  cycleRemainingMinutes: number
}

export interface RouteLeg {
  from: string
  to: string
  distanceMiles: number
  durationMinutes: number
}

export interface RouteStep {
  instruction: string
  distanceMiles: number
  durationMinutes: number
}

export interface TripStop extends Coordinates {
  id: string
  sequence: number
  type: StopType
  label: string
  arrivalAt: string
  departureAt: string
  durationMinutes: number
  cumulativeMiles: number
  dutyStatus: DutyStatus
  note: string
}

export interface DutyEvent {
  id: string
  startAt: string
  endAt: string
  status: DutyStatus
  activity: string
  locationLabel: string
  distanceMiles: number
}

export interface DutyTotals {
  offDuty: number
  sleeperBerth: number
  driving: number
  onDutyNotDriving: number
}

export interface LogSegment {
  startMinute: number
  endMinute: number
  status: DutyStatus
  activity: string
  distanceMiles: number
}

export interface LogRemark {
  minute: number
  label: string
  location: string
}

export interface DailyLog {
  date: string
  timezone: string
  from: string
  to: string
  totalMiles: number
  totalsMinutes: DutyTotals
  segments: LogSegment[]
  remarks: LogRemark[]
  recap?: {
    onDutyTodayMinutes: number
    cycleUsedEndMinutes: number
    cycleRemainingMinutes: number
    restartCompleted: boolean
    estimated: boolean
  }
  formFields?: Record<string, string | number | null>
}

export interface TripPlan {
  summary: PlanSummary
  timezone: string
  routeCoordinates: [number, number][]
  routeLegs: RouteLeg[]
  routeSteps: RouteStep[]
  stops: TripStop[]
  dutyEvents: DutyEvent[]
  dailyLogs: DailyLog[]
  assumptions: string[]
  warnings: string[]
  resolvedLocations?: {
    current?: ResolvedLocation
    pickup?: ResolvedLocation
    dropoff?: ResolvedLocation
  }
}

export interface ApiErrorEnvelope {
  error?:
    | string
    | {
        code?: string
        message?: string
        field?: string
        fields?: Record<string, string[] | string>
      }
  detail?: string
}

export type TripFormFields = Omit<TripPlanRequest, "start_at">

export type TripFieldErrors = Partial<Record<keyof TripFormFields, string>>
