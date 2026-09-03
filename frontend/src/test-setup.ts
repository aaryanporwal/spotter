import "@testing-library/jest-dom/vitest"
import { createElement, type ReactNode } from "react"
import { vi } from "vitest"

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

vi.mock("leaflet", () => ({
  default: {
    divIcon: () => ({ options: {} }),
  },
}))

vi.mock("react-leaflet", () => {
  const Passthrough = ({ children }: { children?: ReactNode }) =>
    createElement("div", { "data-testid": "map" }, children)
  const MapContainer = ({
    children,
    touchZoom,
    scrollWheelZoom,
    zoomControl,
  }: {
    children?: ReactNode
    touchZoom?: boolean | string
    scrollWheelZoom?: boolean | string
    zoomControl?: boolean
  }) =>
    createElement(
      "div",
      {
        "data-testid": "map-container",
        "data-touch-zoom": String(touchZoom),
        "data-scroll-wheel-zoom": String(scrollWheelZoom),
        "data-default-zoom-control": String(zoomControl),
      },
      children,
    )

  return {
    MapContainer,
    Marker: Passthrough,
    Popup: Passthrough,
    Polyline: () => null,
    TileLayer: () => null,
    useMap: () => ({
      setView: () => undefined,
      fitBounds: () => undefined,
      invalidateSize: () => undefined,
    }),
  }
})
