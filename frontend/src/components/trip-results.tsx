import { useState } from "react"
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Clock3,
  FileText,
  Fuel,
  Info,
  Map,
  Navigation,
  Printer,
  Route,
  TimerReset,
} from "lucide-react"

import { DailyLogSheet } from "@/components/daily-log-sheet"
import { RouteMap } from "@/components/route-map"
import { StopsTimeline } from "@/components/stops-timeline"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { TripFormFields, TripPlan } from "@/types/trip"

interface TripResultsProps {
  plan: TripPlan
  request: TripFormFields
  isUpgradingRoute?: boolean
  routeUpgradeError?: string
  onShowExactRoute?: () => void
  onEdit: () => void
}

function formatDuration(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return " - "
  const rounded = Math.round(minutes)
  const days = Math.floor(rounded / 1440)
  const hours = Math.floor((rounded % 1440) / 60)
  const mins = rounded % 60
  const parts: string[] = []
  if (days) parts.push(`${days}d`)
  if (hours) parts.push(`${hours}h`)
  if (mins && parts.length < 2) parts.push(`${mins}m`)
  return parts.join(" ") || "0m"
}

function formatDateTime(value: string, timezone?: string) {
  if (!value) return " - "
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }
  try {
    if (timezone && timezone !== "UTC") options.timeZone = timezone
    return new Intl.DateTimeFormat("en-US", options).format(date)
  } catch {
    delete options.timeZone
    return new Intl.DateTimeFormat("en-US", options).format(date)
  }
}

function formatLogDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date)
}

function Metric({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="min-w-0 p-4 sm:p-5">
      <div className="mb-3 flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold tracking-[-0.025em] tabular-nums sm:text-2xl">
        {value}
      </p>
      {detail ? <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  )
}

function Directions({ plan }: { plan: TripPlan }) {
  if (!plan.routeSteps.length) return null
  return (
    <Card>
      <Accordion type="single" collapsible>
        <AccordionItem value="directions" className="border-0 px-5 md:px-6">
          <AccordionTrigger>
            <span className="flex items-center gap-2">
              <Navigation className="size-4 text-muted-foreground" />
              Turn-by-turn directions
              <Badge variant="secondary">{plan.routeSteps.length}</Badge>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <ol className="divide-y divide-border" aria-label="Turn-by-turn directions">
              {plan.routeSteps.map((step, index) => (
                <li
                  key={`${step.instruction}-${index}`}
                  className="grid grid-cols-[26px_1fr_auto] items-start gap-2 py-3 first:pt-1"
                >
                  <span className="grid size-6 place-items-center rounded-full bg-muted text-[10px] font-semibold tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="pt-0.5 text-sm leading-5">{step.instruction}</span>
                  <span className="pt-0.5 text-xs tabular-nums text-muted-foreground">
                    {step.distanceMiles >= 0.1
                      ? `${step.distanceMiles.toFixed(step.distanceMiles < 10 ? 1 : 0)} mi`
                      : ""}
                  </span>
                </li>
              ))}
            </ol>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  )
}

function RouteOverview({
  plan,
  isUpgradingRoute,
  routeUpgradeError,
  onShowExactRoute,
}: {
  plan: TripPlan
  isUpgradingRoute?: boolean
  routeUpgradeError?: string
  onShowExactRoute?: () => void
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)]">
      <div className="min-w-0 space-y-5">
        <RouteMap
          coordinates={plan.routeCoordinates}
          stops={plan.stops}
          routeOverview={plan.routeOverview}
          isUpgrading={isUpgradingRoute}
          upgradeError={routeUpgradeError}
          onShowExactRoute={plan.routeOverview === "full" ? undefined : onShowExactRoute}
        />
        <Directions plan={plan} />
      </div>

      <Card className="min-w-0 lg:max-h-[548px]">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Stops & duty changes</CardTitle>
            <Badge variant="secondary">{plan.stops.length} stops</Badge>
          </div>
          <CardDescription>
            Times shown in {plan.timezone} (trip log timezone).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="lg:max-h-[430px] lg:pr-2">
            <StopsTimeline stops={plan.stops} timezone={plan.timezone} />
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

function DailyLogs({ plan }: { plan: TripPlan }) {
  const [selectedDay, setSelectedDay] = useState(0)
  const activeIndex = Math.min(selectedDay, Math.max(plan.dailyLogs.length - 1, 0))
  const activeLog = plan.dailyLogs[activeIndex]

  if (!activeLog) {
    return (
      <Alert>
        <Info />
        <AlertTitle>No daily logs were returned</AlertTitle>
        <AlertDescription>Edit the trip and try planning it again.</AlertDescription>
      </Alert>
    )
  }

  return (
    <div>
      <div className="no-print mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" />
          <p className="text-sm font-medium">
            {plan.dailyLogs.length} {plan.dailyLogs.length === 1 ? "log sheet" : "log sheets"}
          </p>
          <Badge variant="outline">Estimated</Badge>
        </div>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1" role="group" aria-label="Choose log day">
          {plan.dailyLogs.map((log, index) => (
            <button
              key={log.date}
              type="button"
              className={cn(
                "min-h-8 shrink-0 rounded-md px-3 text-xs font-medium outline-none transition-[color,background-color,box-shadow,transform] duration-150 ease-out active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring/40",
                activeIndex === index
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={activeIndex === index}
              onClick={() => setSelectedDay(index)}
            >
              Day {index + 1} · {formatLogDate(log.date)}
            </button>
          ))}
        </div>
      </div>
      <p className="no-print mb-2 text-xs text-muted-foreground sm:hidden">
        Swipe sideways to inspect the full log sheet.
      </p>
      <div className="overflow-x-auto pb-2">
        <DailyLogSheet log={activeLog} index={activeIndex} />
      </div>
      <p className="no-print mt-3 text-xs leading-5 text-muted-foreground">
        These sheets are planning estimates, not a replacement for a certified ELD record. Confirm actual duty changes as the trip progresses.
      </p>
    </div>
  )
}

export function TripResults({
  plan,
  request,
  isUpgradingRoute,
  routeUpgradeError,
  onShowExactRoute,
  onEdit,
}: TripResultsProps) {
  const distance = `${Math.round(plan.summary.distanceMiles).toLocaleString("en-US")} mi`
  const cycleLeft = Math.max(0, plan.summary.cycleRemainingMinutes)

  return (
    <main id="main-content" className="mx-auto w-full max-w-[1200px] px-4 pb-20 pt-8 sm:px-6 sm:pt-10 lg:px-8">
      <div className="no-print mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" className="-ml-3 mb-3" onClick={onEdit}>
            <ArrowLeft />
            Edit trip
          </Button>
          <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="truncate">{request.current_location}</span>
            <ChevronRight className="size-3.5 shrink-0" />
            <span className="truncate">{request.pickup_location}</span>
            <ChevronRight className="size-3.5 shrink-0" />
            <span className="truncate">{request.dropoff_location}</span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Your trip plan</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Estimated arrival {formatDateTime(plan.summary.eta, plan.timezone)}
            <span className="ml-1 text-muted-foreground/80">
              ({plan.timezone} log time)
            </span>
          </p>
        </div>
        <Button variant="outline" onClick={() => window.print()} className="self-start">
          <Printer />
          Print all logs
        </Button>
      </div>

      {plan.warnings.length ? (
        <Alert variant="info" className="no-print mb-5">
          <Info />
          <AlertTitle>Planning estimate</AlertTitle>
          <AlertDescription>{plan.warnings.join(" ")}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="no-print mb-6 overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-4 sm:divide-y-0">
          <Metric icon={<Route className="size-4" />} label="Distance" value={distance} />
          <Metric
            icon={<Clock3 className="size-4" />}
            label="Drive time"
            value={formatDuration(plan.summary.drivingMinutes)}
          />
          <Metric
            icon={<TimerReset className="size-4" />}
            label="Total trip"
            value={formatDuration(plan.summary.elapsedMinutes)}
            detail="Includes pickup, drop-off & rest"
          />
          <Metric
            icon={<Fuel className="size-4" />}
            label="En-route stops"
            value={`${plan.summary.fuelStops + plan.summary.restStops}`}
            detail={`${plan.summary.fuelStops} fuel · ${plan.summary.restStops} rest`}
          />
        </div>
      </Card>

      <Tabs defaultValue="route" className="no-print">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-3">
          <TabsList className="w-full min-w-0 sm:w-fit">
            <TabsTrigger value="route">
              <Map />
              Route
            </TabsTrigger>
            <TabsTrigger value="logs">
              <FileText />
              Daily logs
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-foreground/10 px-1 text-[10px] font-semibold leading-none tabular-nums">
                {plan.summary.logDays || plan.dailyLogs.length}
              </span>
            </TabsTrigger>
          </TabsList>
          {cycleLeft > 0 ? (
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatDuration(cycleLeft)} cycle remaining at arrival
            </p>
          ) : null}
        </div>
        <TabsContent value="route">
          <RouteOverview
            plan={plan}
            isUpgradingRoute={isUpgradingRoute}
            routeUpgradeError={routeUpgradeError}
            onShowExactRoute={onShowExactRoute}
          />
        </TabsContent>
        <TabsContent value="logs">
          <DailyLogs plan={plan} />
        </TabsContent>
      </Tabs>

      <div className="print-only">
        {plan.dailyLogs.map((log, index) => (
          <DailyLogSheet key={`print-${log.date}`} log={log} index={index} />
        ))}
      </div>

      {plan.assumptions.length ? (
        <Card className="no-print mt-6">
          <Accordion type="single" collapsible>
            <AccordionItem value="assumptions" className="border-0 px-5 md:px-6">
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <Info className="size-4 text-muted-foreground" />
                  Planning assumptions
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-2 text-sm leading-5 text-muted-foreground">
                  {plan.assumptions.map((assumption) => (
                    <li key={assumption} className="flex gap-2">
                      <span className="mt-2 size-1 shrink-0 rounded-full bg-current" />
                      {assumption}
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Card>
      ) : null}
      <Separator className="no-print mt-10" />
    </main>
  )
}
