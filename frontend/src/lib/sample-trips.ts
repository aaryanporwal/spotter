import type { LocationSuggestion, TripFormFields } from "@/types/trip"

export type SampleTrip = {
  id: "same-day" | "hos-break" | "long-haul" | "cycle-restart"
  label: string
  summary: string
  cycleHours: number
  current: LocationSuggestion
  pickup: LocationSuggestion
  dropoff: LocationSuggestion
}

function city(
  label: string,
  latitude: number,
  longitude: number,
): LocationSuggestion {
  return { label, latitude, longitude }
}

export const SAMPLE_TRIPS: readonly SampleTrip[] = [
  {
    id: "same-day",
    label: "Same day",
    summary: "Nashville → Little Rock",
    cycleHours: 0,
    current: city("Nashville, TN", 36.1627, -86.7816),
    pickup: city("Memphis, TN", 35.1495, -90.049),
    dropoff: city("Little Rock, AR", 34.7465, -92.2896),
  },
  {
    id: "hos-break",
    label: "30-min break",
    summary: "San Antonio → El Paso",
    cycleHours: 0,
    current: city("New Braunfels, TX", 29.703, -98.1245),
    pickup: city("San Antonio, TX", 29.4241, -98.4936),
    dropoff: city("El Paso, TX", 31.7619, -106.485),
  },
  {
    id: "long-haul",
    label: "Long haul",
    summary: "Chicago → Miami",
    cycleHours: 0,
    current: city("Chicago, IL", 41.8781, -87.6298),
    pickup: city("Detroit, MI", 42.3314, -83.0458),
    dropoff: city("Miami, FL", 25.7617, -80.1918),
  },
  {
    id: "cycle-restart",
    label: "Cycle restart",
    summary: "68h already used",
    cycleHours: 68,
    current: city("Nashville, TN", 36.1627, -86.7816),
    pickup: city("Memphis, TN", 35.1495, -90.049),
    dropoff: city("Little Rock, AR", 34.7465, -92.2896),
  },
]

export function fieldsFromSampleTrip(sample: SampleTrip): TripFormFields {
  return {
    current_location: sample.current.label,
    pickup_location: sample.pickup.label,
    dropoff_location: sample.dropoff.label,
    current_cycle_used_hours: sample.cycleHours,
  }
}

export function findSampleTrip(values: TripFormFields): SampleTrip | undefined {
  return SAMPLE_TRIPS.find((sample) => {
    const fields = fieldsFromSampleTrip(sample)
    return (
      fields.current_location === values.current_location &&
      fields.pickup_location === values.pickup_location &&
      fields.dropoff_location === values.dropoff_location &&
      fields.current_cycle_used_hours === Number(values.current_cycle_used_hours)
    )
  })
}
