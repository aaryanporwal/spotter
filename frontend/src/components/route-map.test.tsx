import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { RouteMap } from "@/components/route-map"

const coordinates: [number, number][] = [
  [32.8, -96.8],
  [32.75, -97.3],
]

describe("RouteMap", () => {
  afterEach(() => {
    cleanup()
  })

  it("offers an exact-route upgrade on a simplified path", () => {
    const onShowExactRoute = vi.fn()
    render(
      <RouteMap
        coordinates={coordinates}
        stops={[]}
        routeOverview="simplified"
        onShowExactRoute={onShowExactRoute}
      />,
    )

    expect(screen.getByRole("button", { name: /show exact route/i })).toBeInTheDocument()
    screen.getByRole("button", { name: /show exact route/i }).click()
    expect(onShowExactRoute).toHaveBeenCalledOnce()
  })

  it("shows a quiet exact-route status after upgrade", () => {
    render(
      <RouteMap coordinates={coordinates} stops={[]} routeOverview="full" />,
    )

    expect(screen.getByText(/exact route/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /show exact route/i })).not.toBeInTheDocument()
  })

  it("keeps the map usable while the exact path loads", () => {
    render(
      <RouteMap
        coordinates={coordinates}
        stops={[]}
        routeOverview="simplified"
        isUpgrading
        onShowExactRoute={() => undefined}
      />,
    )

    expect(screen.getByRole("status")).toHaveTextContent(/loading exact route/i)
    expect(screen.getByLabelText(/map of the planned route/i)).toHaveAttribute(
      "aria-busy",
      "true",
    )
  })

  it("enables native map gestures and offers accessible controls", () => {
    render(<RouteMap coordinates={coordinates} stops={[]} />)

    expect(screen.getByTestId("map-container")).toHaveAttribute(
      "data-touch-zoom",
      "true",
    )
    expect(screen.getByTestId("map-container")).toHaveAttribute(
      "data-scroll-wheel-zoom",
      "center",
    )
    expect(screen.getByRole("button", { name: /zoom in/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /zoom out/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /fit entire route/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /expand map/i })).toBeInTheDocument()
  })
})
