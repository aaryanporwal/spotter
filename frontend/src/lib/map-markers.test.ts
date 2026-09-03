import { describe, expect, it } from "vitest"

import {
  MAP_MARKER_SIZE,
  iconAnchorForGroup,
  placeOverlappingMarkers,
} from "@/lib/map-markers"

describe("placeOverlappingMarkers", () => {
  it("keeps a lone marker centered on its coordinate", () => {
    const [marker] = placeOverlappingMarkers([
      { id: "start", latitude: 36.1627, longitude: -86.7816 },
    ])

    expect(marker?.iconAnchor).toEqual([MAP_MARKER_SIZE / 2, MAP_MARKER_SIZE / 2])
    expect(marker?.groupSize).toBe(1)
  })

  it("splits current and pickup when they share a point", () => {
    const start = { id: "start", latitude: 36.1627, longitude: -86.7816 }
    const pickup = { id: "pickup", latitude: 36.1627, longitude: -86.7816 }

    const [first, second] = placeOverlappingMarkers([start, pickup])

    expect(first?.groupSize).toBe(2)
    expect(second?.groupSize).toBe(2)
    expect(first?.iconAnchor).not.toEqual(second?.iconAnchor)
    expect(first?.iconAnchor[1]).toBeCloseTo(MAP_MARKER_SIZE / 2)
    expect(second?.iconAnchor[1]).toBeCloseTo(MAP_MARKER_SIZE / 2)
  })

  it("does not offset stops that are actually apart", () => {
    const markers = placeOverlappingMarkers([
      { id: "start", latitude: 36.1627, longitude: -86.7816 },
      { id: "dropoff", latitude: 32.7767, longitude: -96.797 },
    ])

    expect(markers.every((marker) => marker.groupSize === 1)).toBe(true)
    expect(iconAnchorForGroup(0, 1)).toEqual([15, 15])
  })
})
