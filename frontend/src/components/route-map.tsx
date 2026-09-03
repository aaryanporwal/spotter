import { useEffect, useMemo, useRef } from "react"
import L, { type LatLngBoundsExpression } from "leaflet"
import { Check, LoaderCircle } from "lucide-react"
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet"

import { Badge } from "@/components/ui/badge"
import {
  MAP_MARKER_SIZE,
  placeOverlappingMarkers,
} from "@/lib/map-markers"
import type { RouteOverview, TripStop } from "@/types/trip"

interface RouteMapProps {
  coordinates: [number, number][]
  stops: TripStop[]
  routeOverview?: RouteOverview
  isUpgrading?: boolean
  upgradeError?: string
  onShowExactRoute?: () => void
}

function MapBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  const start = points[0]
  const end = points[points.length - 1]
  const fitKey = start
    ? `${start[0].toFixed(5)},${start[1].toFixed(5)}:${end[0].toFixed(5)},${end[1].toFixed(5)}:${points.length <= 1 ? "1" : "n"}`
    : ""
  const pointsRef = useRef(points)
  pointsRef.current = points

  useEffect(() => {
    const current = pointsRef.current
    if (!current.length) return
    if (current.length === 1) {
      map.setView(current[0], 10, { animate: false })
      return
    }
    map.fitBounds(current as LatLngBoundsExpression, {
      padding: [32, 32],
      maxZoom: 10,
      animate: false,
    })
  }, [map, fitKey])
  return null
}

function markerIcon(
  sequence: number,
  isEndpoint: boolean,
  iconAnchor: [number, number],
  popupAnchor: [number, number],
) {
  return L.divIcon({
    className: "milemark-map-marker",
    html: `<span class="${isEndpoint ? "is-endpoint" : ""}">${sequence}</span>`,
    iconSize: [MAP_MARKER_SIZE, MAP_MARKER_SIZE],
    iconAnchor,
    popupAnchor,
  })
}

function RouteDetailControl({
  routeOverview,
  isUpgrading,
  upgradeError,
  onShowExactRoute,
}: {
  routeOverview: RouteOverview
  isUpgrading: boolean
  upgradeError?: string
  onShowExactRoute?: () => void
}) {
  const canUpgrade = routeOverview !== "full" && Boolean(onShowExactRoute)

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1100] flex justify-start p-2.5 pr-24 sm:p-3">
      <div className="pointer-events-auto max-w-full rounded-lg border border-border bg-background/95 shadow-card backdrop-blur-sm">
        {isUpgrading ? (
          <p
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground"
            role="status"
            aria-live="polite"
          >
            <LoaderCircle className="size-3.5 animate-spin text-muted-foreground motion-reduce:animate-none" />
            Loading exact route
          </p>
        ) : upgradeError && canUpgrade ? (
          <div className="flex items-center gap-2 px-2 py-1.5">
            <p className="max-w-44 truncate pl-1 text-xs text-destructive" title={upgradeError}>
              Couldn’t load exact route
            </p>
            <button
              type="button"
              className="min-h-8 shrink-0 rounded-md px-2.5 text-xs font-medium text-foreground outline-none transition-[color,background-color,transform] duration-150 ease-out hover:bg-muted active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring/40"
              onClick={onShowExactRoute}
            >
              Try again
            </button>
          </div>
        ) : routeOverview === "full" ? (
          <p className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground">
            <Check className="size-3.5 text-emerald-700" aria-hidden="true" />
            Exact route
          </p>
        ) : canUpgrade ? (
          <div className="flex items-center gap-1 pl-3 pr-1.5">
            <p className="text-xs text-muted-foreground">Approximate path</p>
            <button
              type="button"
              className="min-h-8 rounded-md px-2.5 text-xs font-medium text-foreground outline-none transition-[color,background-color,transform] duration-150 ease-out hover:bg-muted active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring/40"
              onClick={onShowExactRoute}
            >
              Show exact route
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function RouteMap({
  coordinates,
  stops,
  routeOverview = "simplified",
  isUpgrading = false,
  upgradeError,
  onShowExactRoute,
}: RouteMapProps) {
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
  const markers = useMemo(() => placeOverlappingMarkers(validStops), [validStops])
  const showDetailControl = Boolean(onShowExactRoute) || routeOverview === "full" || isUpgrading

  return (
    <div
      className="route-map isolate relative h-[320px] w-full overflow-hidden rounded-xl border border-border bg-muted sm:h-[400px]"
      aria-label="Map of the planned route and stops"
      aria-busy={isUpgrading}
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
            pathOptions={{
              color: "#171717",
              weight: 5,
              opacity: isUpgrading ? 0.45 : 0.92,
            }}
          />
        ) : null}
        {markers.map(({ item: stop, iconAnchor, popupAnchor }, index) => (
          <Marker
            key={stop.id}
            position={[stop.latitude, stop.longitude]}
            zIndexOffset={(markers.length - index) * 10}
            icon={markerIcon(
              index + 1,
              stop.type === "start" || stop.type === "dropoff",
              iconAnchor,
              popupAnchor,
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
      {showDetailControl ? (
        <RouteDetailControl
          routeOverview={routeOverview}
          isUpgrading={isUpgrading}
          upgradeError={upgradeError}
          onShowExactRoute={onShowExactRoute}
        />
      ) : null}
    </div>
  )
}
