import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { TripForm } from "@/components/trip-form"
import { SAMPLE_TRIPS, fieldsFromSampleTrip } from "@/lib/sample-trips"
import type { TripFormFields } from "@/types/trip"

const emptyValues: TripFormFields = {
  current_location: "",
  pickup_location: "",
  dropoff_location: "",
  current_cycle_used_hours: 0,
}

describe("TripForm samples", () => {
  afterEach(() => {
    cleanup()
  })

  it("fills locations, cycle hours, and coordinates from a sample", () => {
    const onChange = vi.fn()
    const onSubmit = vi.fn()
    const sample = SAMPLE_TRIPS.find((trip) => trip.id === "same-day")!

    render(
      <TripForm
        initialValues={emptyValues}
        isLoading={false}
        onChange={onChange}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Same day. Nashville → Little Rock" }))

    expect(screen.getByLabelText(/current location/i)).toHaveValue(sample.current.label)
    expect(screen.getByLabelText(/^pickup$/i)).toHaveValue(sample.pickup.label)
    expect(screen.getByLabelText(/drop-off/i)).toHaveValue(sample.dropoff.label)
    expect(screen.getByLabelText(/current cycle used/i)).toHaveValue(sample.cycleHours)
    expect(
      screen.getByRole("button", { name: "Same day. Nashville → Little Rock" }),
    ).toHaveAttribute("aria-pressed", "true")

    fireEvent.click(screen.getByRole("button", { name: /plan my trip/i }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].request).toMatchObject({
      current_cycle_used_hours: sample.cycleHours,
      current_location: {
        query: sample.current.label,
        label: sample.current.label,
        lat: sample.current.latitude,
        lng: sample.current.longitude,
      },
      pickup_location: {
        lat: sample.pickup.latitude,
        lng: sample.pickup.longitude,
      },
      dropoff_location: {
        lat: sample.dropoff.latitude,
        lng: sample.dropoff.longitude,
      },
    })
  })

  it("loads the 34-hour restart sample and clears selection after an edit", () => {
    render(
      <TripForm
        initialValues={emptyValues}
        isLoading={false}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    const restart = SAMPLE_TRIPS.find((trip) => trip.id === "cycle-restart")!
    const restartButton = screen.getByRole("button", {
      name: "Cycle restart. 68h already used",
    })
    fireEvent.click(restartButton)

    expect(screen.getByLabelText(/current cycle used/i)).toHaveValue(restart.cycleHours)
    expect(restartButton).toHaveAttribute("aria-pressed", "true")

    fireEvent.change(screen.getByLabelText(/current location/i), {
      target: { value: "Boston, MA" },
    })
    expect(restartButton).toHaveAttribute("aria-pressed", "false")
  })

  it("restores sample coordinates when the form reopens with matching values", () => {
    const sample = SAMPLE_TRIPS.find((trip) => trip.id === "hos-break")!
    const onSubmit = vi.fn()

    render(
      <TripForm
        initialValues={fieldsFromSampleTrip(sample)}
        isLoading={false}
        onChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    )

    expect(
      screen.getByRole("button", { name: "30-min break. San Antonio → El Paso" }),
    ).toHaveAttribute("aria-pressed", "true")

    fireEvent.click(screen.getByRole("button", { name: /plan my trip/i }))
    expect(onSubmit.mock.calls[0][0].request.current_location).toMatchObject({
      lat: sample.current.latitude,
      lng: sample.current.longitude,
    })
  })
})
