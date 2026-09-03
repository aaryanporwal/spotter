import { useRef, useState } from "react"

import { PlanLoading } from "@/components/plan-loading"
import { ThemeToggle } from "@/components/theme-toggle"
import { TripForm } from "@/components/trip-form"
import { TripResults } from "@/components/trip-results"
import { planRequestWithOverview, planTrip, TripPlanError } from "@/lib/api"
import { cn } from "@/lib/utils"
import type {
  TripFieldErrors,
  TripFormFields,
  TripPlan,
  TripPlanRequest,
} from "@/types/trip"

const emptyRequest: TripFormFields = {
  current_location: "",
  pickup_location: "",
  dropoff_location: "",
  current_cycle_used_hours: 0,
}

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError"
}

export default function App() {
  const [request, setRequest] = useState<TripFormFields>(emptyRequest)
  const [planRequest, setPlanRequest] = useState<TripPlanRequest | null>(null)
  const [plan, setPlan] = useState<TripPlan | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isUpgradingRoute, setIsUpgradingRoute] = useState(false)
  const [routeUpgradeError, setRouteUpgradeError] = useState<string>()
  const [errorMessage, setErrorMessage] = useState<string>()
  const [fieldErrors, setFieldErrors] = useState<TripFieldErrors>({})
  const planAbortRef = useRef<AbortController | null>(null)

  const abortInFlight = () => {
    planAbortRef.current?.abort()
    planAbortRef.current = null
  }

  const submit = async (payload: {
    values: TripFormFields
    request: TripPlanRequest
  }) => {
    const { values, request: nextRequest } = payload
    abortInFlight()
    const controller = new AbortController()
    planAbortRef.current = controller
    setRequest(values)
    setPlanRequest(nextRequest)
    setIsLoading(true)
    setIsUpgradingRoute(false)
    setRouteUpgradeError(undefined)
    setErrorMessage(undefined)
    setFieldErrors({})
    try {
      const nextPlan = await planTrip(nextRequest, controller.signal)
      setPlan(nextPlan)
    } catch (error) {
      if (isAbortError(error)) return
      if (error instanceof TripPlanError) {
        setErrorMessage(error.message)
        setFieldErrors(error.fields)
      } else {
        setErrorMessage("We couldn’t build this trip. Check the locations and try again.")
      }
    } finally {
      if (planAbortRef.current === controller) planAbortRef.current = null
      setIsLoading(false)
    }
  }

  const showExactRoute = async () => {
    if (!plan || !planRequest || isUpgradingRoute) return
    abortInFlight()
    const controller = new AbortController()
    planAbortRef.current = controller
    setIsUpgradingRoute(true)
    setRouteUpgradeError(undefined)
    try {
      const nextPlan = await planTrip(
        planRequestWithOverview(planRequest, plan, "full"),
        controller.signal,
      )
      setPlan(nextPlan)
      setPlanRequest((current) =>
        current ? { ...current, route_overview: "full" } : current,
      )
    } catch (error) {
      if (isAbortError(error)) return
      setRouteUpgradeError(
        error instanceof TripPlanError
          ? error.message
          : "Couldn’t load the exact route.",
      )
    } finally {
      if (planAbortRef.current === controller) planAbortRef.current = null
      setIsUpgradingRoute(false)
    }
  }

  return (
    <div
      className={cn(
        "text-foreground",
        plan ? "min-h-dvh" : "flex h-dvh flex-col overflow-hidden",
      )}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-sm focus:text-background"
      >
        Skip to content
      </a>
      <header className="no-print shrink-0 border-b border-border/80 bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-12 w-full max-w-[1200px] items-center justify-between px-4 sm:h-14 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <img src="/logo.png" alt="" className="h-8 w-8 rounded-lg object-cover" aria-hidden="true" />
              <p className="text-xl font-bold tracking-[-0.03em]">Milemark</p>
            </div>
            <p className="hidden text-xs text-muted-foreground sm:block">
              HOS route & daily logs
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>
      {plan ? (
        <TripResults
          plan={plan}
          request={request}
          isUpgradingRoute={isUpgradingRoute}
          routeUpgradeError={routeUpgradeError}
          onShowExactRoute={showExactRoute}
          onEdit={() => {
            abortInFlight()
            setIsUpgradingRoute(false)
            setRouteUpgradeError(undefined)
            setPlan(null)
            window.scrollTo({ top: 0, behavior: "auto" })
          }}
        />
      ) : (
        <TripForm
          initialValues={request}
          fieldErrors={fieldErrors}
          errorMessage={errorMessage}
          isLoading={isLoading}
          onChange={setRequest}
          onSubmit={submit}
        />
      )}
      {isLoading ? <PlanLoading /> : null}
    </div>
  )
}
