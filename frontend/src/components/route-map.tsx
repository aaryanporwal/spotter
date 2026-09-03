import { useEffect, useMemo } from "react"
import L, { type LatLngBoundsExpression } from "leaflet"
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet"

import { Badge } from "@/components/ui/badge"
import type { TripStop } from "@/types/trip"

interface RouteMapProps {
  coordinates: [number, number][]
  stops: TripStop[]
}

function MapBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return
    if (points.length === 1) {
      map.setView(points[0], 10, { animate: false })
      return
    }
    map.fitBounds(points as LatLngBoundsExpression, {
      padding: [32, 32],
      maxZoom: 10,
      animate: false,
    })
  }, [map, points])
  return null
}

function markerIcon(sequence: number, isEndpoint: boolean) {
  return L.divIcon({
    className: "milemark-map-marker",
    html: `<span class="${isEndpoint ? "is-endpoint" : ""}">${sequence}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -18],
  })
}

export function RouteMap({ coordinates, stops }: RouteMapProps) {
  const validStops = useMemo(
    () =>
      [...stops]
        .filter(
          (stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude),
        )
        .sort((a, b) => a.sequence - b.sequence),
    [stops],
  )
  const points = useMemo(
    () =>
      coordinates.length
        ? coordinates
        : validStops.map((stop): [number, number] => [stop.latitude, stop.longitude]),
    [coordinates, validStops],
  )
  const center: [number, number] = points[0] ?? [39.8283, -98.5795]

  return (
    <div
      className="route-map isolate h-[320px] w-full overflow-hidden rounded-xl border border-border bg-muted sm:h-[400px]"
      aria-label="Map of the planned route and stops"
    >
      <MapContainer
        center={center}
        zoom={4}
        scrollWheelZoom={false}
        className="h-full w-full"
        preferCanvas
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {coordinates.length > 1 ? (
          <Polyline
            positions={coordinates}
            pathOptions={{ color: "#171717", weight: 5, opacity: 0.92 }}
          />
        ) : null}
        {validStops.map((stop, index) => (
          <Marker
            key={stop.id}
            position={[stop.latitude, stop.longitude]}
            icon={markerIcon(
              index + 1,
              stop.type === "start" || stop.type === "dropoff",
            )}
          >
            <Popup closeButton={false}>
              <div className="min-w-40 font-sans">
                <Badge variant="secondary" className="mb-1.5 capitalize">
                  {stop.type.replaceAll("_", " ")}
                </Badge>
                <p className="m-0 font-semibold text-foreground">{stop.label}</p>
                {stop.note ? (
                  <p className="mb-0 mt-1 text-xs leading-4 text-muted-foreground">
                    {stop.note}
                  </p>
                ) : null}
              </div>
            </Popup>
          </Marker>
        ))}
        <MapBounds points={points} />
      </MapContainer>
    </div>
  )
}
