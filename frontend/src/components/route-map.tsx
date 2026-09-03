import { useEffect, useMemo, useRef, useState } from "react"
import L, { type LatLngBoundsExpression } from "leaflet"
import {
  Check,
  LocateFixed,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
} from "lucide-react"
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet"

import { Badge } from "@/components/ui/badge"
import { useTheme } from "@/components/theme-provider"
import {
  MAP_MARKER_SIZE,
  placeOverlappingMarkers,
} from "@/lib/map-markers"
import { cn } from "@/lib/utils"
import type { RouteOverview, TripStop } from "@/types/trip"

interface RouteMapProps {
  coordinates: [number, number][]
  stops: TripStop[]
  routeOverview?: RouteOverview
  isUpgrading?: boolean
  upgradeError?: string
  onShowExactRoute?: () => void
}

function fitMapToPoints(
  map: L.Map,
  points: [number, number][],
  animate: boolean,
) {
  if (!points.length) return
  if (points.length === 1) {
    map.setView(points[0], 10, { animate })
    return
  }
  map.fitBounds(points as LatLngBoundsExpression, {
    padding: [44, 44],
    maxZoom: 11,
    animate,
  })
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
    fitMapToPoints(map, current, false)
  }, [map, fitKey])
  return null
}

function MapResize({
  expanded,
  points,
}: {
  expanded: boolean
  points: [number, number][]
}) {
  const map = useMap()
  const pointsRef = useRef(points)
  pointsRef.current = points

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      map.invalidateSize()
      if (expanded) fitMapToPoints(map, pointsRef.current, false)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [expanded, map])

  return null
}

function markerIcon(
  sequence: number,
  type: TripStop["type"],
  iconAnchor: [number, number],
  popupAnchor: [number, number],
) {
  return L.divIcon({
    className: `milemark-map-marker marker-${type}`,
    html: `<span class="marker-pin"><span class="marker-label">${sequence}</span></span>`,
    iconSize: [MAP_MARKER_SIZE, MAP_MARKER_SIZE],
    iconAnchor,
    popupAnchor,
  })
}

function MapButton({
  label,
  onClick,
  children,
  pressed,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  pressed?: boolean
}) {
  return (
    <button
      type="button"
      className="map-control-button grid size-10 place-items-center text-foreground outline-none transition-[color,background-color,transform] duration-150 ease-out hover:bg-muted active:scale-[0.96] focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  )
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
  const { theme } = useTheme()
  const mapRef = useRef<L.Map | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
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
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)

  useEffect(() => {
    if (!isExpanded) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsExpanded(false)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isExpanded])

  const fitRoute = () => {
    if (mapRef.current) fitMapToPoints(mapRef.current, points, true)
  }

  return (
    <>
      {isExpanded ? (
        <button
          type="button"
          className="fixed inset-0 z-[1999] cursor-default bg-black/70 backdrop-blur-sm"
          aria-label="Close expanded map"
          onClick={() => setIsExpanded(false)}
        />
      ) : null}
      <div className="relative h-[340px] w-full sm:h-[430px]">
        <div
          className={cn(
            "route-map isolate overflow-hidden border border-border/80 bg-muted shadow-card",
            isExpanded
              ? "fixed inset-2 z-[2000] rounded-2xl sm:inset-5"
              : "absolute inset-0 rounded-xl",
          )}
          role={isExpanded ? "dialog" : "region"}
          aria-modal={isExpanded || undefined}
          aria-label="Map of the planned route and stops"
          aria-busy={isUpgrading}
        >
          <MapContainer
            ref={mapRef}
            center={center}
            zoom={4}
            minZoom={3}
            maxZoom={18}
            zoomControl={false}
            scrollWheelZoom="center"
            touchZoom
            doubleClickZoom
            keyboard
            bounceAtZoomLimits={false}
            wheelPxPerZoomLevel={90}
            className="h-full w-full"
            preferCanvas
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />
            {coordinates.length > 1 ? (
              <>
                <Polyline
                  positions={coordinates}
                  interactive={false}
                  pathOptions={{
                    className: "milemark-route-casing",
                    color: isDark ? "#0a0a0a" : "#ffffff",
                    weight: 10,
                    opacity: isUpgrading ? 0.4 : 0.88,
                    lineCap: "round",
                    lineJoin: "round",
                  }}
                />
                <Polyline
                  positions={coordinates}
                  interactive={false}
                  pathOptions={{
                    className: "milemark-route-line",
                    color: "#f78c22",
                    weight: 5,
                    opacity: isUpgrading ? 0.55 : 1,
                    dashArray: routeOverview === "full" ? undefined : "3 10",
                    lineCap: "round",
                    lineJoin: "round",
                  }}
                />
              </>
            ) : null}
            {markers.map(({ item: stop, iconAnchor, popupAnchor }, index) => (
              <Marker
                key={stop.id}
                position={[stop.latitude, stop.longitude]}
                zIndexOffset={(markers.length - index) * 10}
                icon={markerIcon(index + 1, stop.type, iconAnchor, popupAnchor)}
                riseOnHover
              >
                <Popup closeButton={false} offset={[0, -2]}>
                  <div className="min-w-48 font-sans">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <Badge variant="secondary" className="capitalize">
                        {stop.type.replaceAll("_", " ")}
                      </Badge>
                      <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                        Stop {index + 1} of {markers.length}
                      </span>
                    </div>
                    <p className="m-0 text-sm font-semibold leading-5 text-foreground">
                      {stop.label}
                    </p>
                    {stop.note ? (
                      <p className="mb-0 mt-1.5 text-xs leading-4 text-muted-foreground">
                        {stop.note}
                      </p>
                    ) : null}
                    {stop.cumulativeMiles > 0 ? (
                      <p className="mb-0 mt-2 border-t border-border pt-2 text-[11px] font-medium tabular-nums text-muted-foreground">
                        Mile {Math.round(stop.cumulativeMiles).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                </Popup>
              </Marker>
            ))}
            <MapBounds points={points} />
            <MapResize expanded={isExpanded} points={points} />
          </MapContainer>

          <div className="pointer-events-none absolute left-3 top-3 z-[1100] sm:left-4 sm:top-4">
            <div className="rounded-xl border border-white/70 bg-background/90 px-3 py-2 shadow-map-control backdrop-blur-md dark:border-white/10">
              <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <span className="size-2 rounded-full bg-primary shadow-[0_0_0_3px_rgb(247_140_34_/_0.18)]" />
                Planned route
                <span className="font-normal text-muted-foreground">
                  · {validStops.length} {validStops.length === 1 ? "stop" : "stops"}
                </span>
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                <span className="sm:hidden">Drag to move · Pinch to zoom</span>
                <span className="hidden sm:inline">Drag to move · Scroll to zoom</span>
              </p>
            </div>
          </div>

          <div className="absolute right-3 top-3 z-[1100] flex flex-col gap-2 sm:right-4 sm:top-4">
            <div className="map-control-group overflow-hidden rounded-xl border border-white/70 bg-background/92 shadow-map-control backdrop-blur-md dark:border-white/10">
              <MapButton label="Zoom in" onClick={() => mapRef.current?.zoomIn()}>
                <Plus className="size-4" aria-hidden="true" />
              </MapButton>
              <MapButton label="Zoom out" onClick={() => mapRef.current?.zoomOut()}>
                <Minus className="size-4" aria-hidden="true" />
              </MapButton>
              <MapButton label="Fit entire route" onClick={fitRoute}>
                <LocateFixed className="size-4" aria-hidden="true" />
              </MapButton>
            </div>
            <div className="overflow-hidden rounded-xl border border-white/70 bg-background/92 shadow-map-control backdrop-blur-md dark:border-white/10">
              <MapButton
                label={isExpanded ? "Exit expanded map" : "Expand map"}
                pressed={isExpanded}
                onClick={() => setIsExpanded((current) => !current)}
              >
                {isExpanded ? (
                  <Minimize2 className="size-4" aria-hidden="true" />
                ) : (
                  <Maximize2 className="size-4" aria-hidden="true" />
                )}
              </MapButton>
            </div>
          </div>

          {showDetailControl ? (
            <RouteDetailControl
              routeOverview={routeOverview}
              isUpgrading={isUpgrading}
              upgradeError={upgradeError}
              onShowExactRoute={onShowExactRoute}
            />
          ) : null}
        </div>
      </div>
    </>
  )
}
