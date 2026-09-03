import "@testing-library/jest-dom/vitest"
import { createElement, type ReactNode } from "react"
import { vi } from "vitest"

vi.mock("leaflet", () => ({
  default: {
    divIcon: () => ({ options: {} }),
  },
}))

vi.mock("react-leaflet", () => {
  const Passthrough = ({ children }: { children?: ReactNode }) =>
    createElement("div", { "data-testid": "map" }, children)

  return {
    MapContainer: Passthrough,
    Marker: Passthrough,
    Popup: Passthrough,
    Polyline: () => null,
    TileLayer: () => null,
    useMap: () => ({ setView: () => undefined, fitBounds: () => undefined }),
  }
})
