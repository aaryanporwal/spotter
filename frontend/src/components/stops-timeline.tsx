import {
  BedDouble,
  CircleDot,
  Clock3,
  Coffee,
  Flag,
  Fuel,
  MapPin,
  PackageCheck,
  RotateCcw,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { StopType, TripStop } from "@/types/trip"

const stopMeta: Record<
  StopType,
  { label: string; Icon: typeof MapPin; badge: "secondary" | "success" | "warning" }
> = {
  start: { label: "Start", Icon: MapPin, badge: "secondary" },
  pickup: { label: "Pickup", Icon: PackageCheck, badge: "warning" },
  break: { label: "30-min break", Icon: Coffee, badge: "success" },
  fuel: { label: "Fuel", Icon: Fuel, badge: "warning" },
  daily_rest: { label: "10-hour rest", Icon: BedDouble, badge: "success" },
  cycle_restart: { label: "34-hour restart", Icon: RotateCcw, badge: "success" },
  dropoff: { label: "Drop-off", Icon: Flag, badge: "secondary" },
}

function formatStopTime(value: string, timezone?: string) {
  if (!value) return "Time pending"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone && timezone !== "UTC" ? timezone : undefined,
      timeZoneName: "short",
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date)
  }
}

function formatDuration(minutes: number) {
  if (!minutes) return null
  if (minutes < 60) return `${Math.round(minutes)} min`
  const hours = Math.floor(minutes / 60)
  const remainder = Math.round(minutes % 60)
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`
}

export function StopsTimeline({
  stops,
  timezone,
}: {
  stops: TripStop[]
  timezone?: string
}) {
  const orderedStops = [...stops].sort((a, b) => a.sequence - b.sequence)
  return (
    <ol className="space-y-0" aria-label="Planned stops">
      {orderedStops.map((stop, index) => {
        const meta = stopMeta[stop.type]
        const duration = formatDuration(stop.durationMinutes)
        return (
          <li key={stop.id} className="relative grid grid-cols-[34px_1fr] gap-3 pb-5 last:pb-0">
            {index < orderedStops.length - 1 ? (
              <span
                className="absolute bottom-0 left-[16px] top-8 w-px bg-border"
                aria-hidden="true"
              />
            ) : null}
            <span
              className={cn(
                "relative z-10 grid size-[34px] place-items-center rounded-full border bg-background shadow-xs",
                stop.type === "start" || stop.type === "dropoff"
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-foreground",
              )}
              aria-hidden="true"
            >
              <meta.Icon className="size-4" />
            </span>
            <div className="min-w-0 pt-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate text-sm font-semibold">{stop.label}</p>
                <Badge variant={meta.badge}>{meta.label}</Badge>
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
                <Clock3 className="size-3.5" aria-hidden="true" />
                {formatStopTime(stop.arrivalAt, timezone)}
                {duration ? <span>· {duration}</span> : null}
              </p>
              {stop.note ? (
                <p className="mt-1.5 text-xs leading-4 text-muted-foreground">{stop.note}</p>
              ) : null}
              {stop.cumulativeMiles > 0 ? (
                <p className="mt-1 flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground/80">
                  <CircleDot className="size-3" aria-hidden="true" />
                  Mile {Math.round(stop.cumulativeMiles).toLocaleString()}
                </p>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
