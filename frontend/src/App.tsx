import { useState } from "react"

import { PlanLoading } from "@/components/plan-loading"
import { TripForm } from "@/components/trip-form"
import { TripResults } from "@/components/trip-results"
import { planTrip, TripPlanError } from "@/lib/api"
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

export default function App() {
  const [request, setRequest] = useState<TripFormFields>(emptyRequest)
  const [plan, setPlan] = useState<TripPlan | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string>()
  const [fieldErrors, setFieldErrors] = useState<TripFieldErrors>({})

  const submit = async (payload: {
    values: TripFormFields
    request: TripPlanRequest
  }) => {
    const { values, request: planRequest } = payload
    setRequest(values)
    setIsLoading(true)
    setErrorMessage(undefined)
    setFieldErrors({})
    try {
      const nextPlan = await planTrip(planRequest)
      setPlan(nextPlan)
    } catch (error) {
      if (error instanceof TripPlanError) {
        setErrorMessage(error.message)
        setFieldErrors(error.fields)
      } else {
        setErrorMessage("We couldn’t build this trip. Check the locations and try again.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-sm focus:text-background"
      >
        Skip to content
      </a>
      <header className="no-print border-b border-border/80 bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold tracking-[-0.03em]">Milemark</p>
          <p className="hidden text-xs text-muted-foreground sm:block">
            HOS route & daily logs
          </p>
        </div>
      </header>
      {plan ? (
        <TripResults
          plan={plan}
          request={request}
          onEdit={() => {
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
