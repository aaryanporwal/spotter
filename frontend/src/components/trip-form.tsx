import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"
import {
  ArrowRight,
  Check,
  Clock3,
  Flag,
  LoaderCircle,
  MapPin,
  PackageCheck,
  ShieldCheck,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { fetchLocationSuggestions } from "@/lib/api"
import { cn } from "@/lib/utils"
import type {
  LocationInput,
  LocationSuggestion,
  TripFieldErrors,
  TripFormFields,
  TripPlanRequest,
} from "@/types/trip"

interface TripFormProps {
  initialValues: TripFormFields
  fieldErrors?: TripFieldErrors
  errorMessage?: string
  isLoading: boolean
  onChange: (values: TripFormFields) => void
  onSubmit: (payload: { values: TripFormFields; request: TripPlanRequest }) => void
}

const locationFields = [
  {
    key: "current_location" as const,
    label: "Current location",
    placeholder: "e.g. Nashville, TN",
    hint: "Where the driver starts",
    Icon: MapPin,
    autoComplete: "street-address",
  },
  {
    key: "pickup_location" as const,
    label: "Pickup",
    placeholder: "e.g. Memphis, TN",
    hint: "Includes 1 hour on duty",
    Icon: PackageCheck,
    autoComplete: "off",
  },
  {
    key: "dropoff_location" as const,
    label: "Drop-off",
    placeholder: "e.g. Dallas, TX",
    hint: "Includes 1 hour on duty",
    Icon: Flag,
    autoComplete: "off",
  },
] as const
type LocationFieldKey = (typeof locationFields)[number]["key"]

const US_ADDRESSES_ONLY = "We only support U.S. addresses."

function isLocationField(key: keyof TripFormFields): key is LocationFieldKey {
  return key !== "current_cycle_used_hours"
}

function toLocationInput(
  typed: string,
  selected?: LocationSuggestion,
): string | LocationInput {
  if (
    selected &&
    selected.label.trim().toLowerCase() === typed.trim().toLowerCase()
  ) {
    return {
      query: typed,
      label: selected.label,
      lat: selected.latitude,
      lng: selected.longitude,
    }
  }
  return typed
}

function validate(values: TripFormFields): TripFieldErrors {
  const errors: TripFieldErrors = {}
  for (const field of locationFields) {
    if (!values[field.key].trim()) errors[field.key] = `Enter the ${field.label.toLowerCase()}.`
  }
  const cycle = Number(values.current_cycle_used_hours)
  if (!Number.isFinite(cycle)) {
    errors.current_cycle_used_hours = "Enter the hours already used."
  } else if (cycle < 0 || cycle > 70) {
    errors.current_cycle_used_hours = "Cycle hours must be between 0 and 70."
  }
  return errors
}

function FormField({
  id,
  label,
  hint,
  error,
  icon,
  children,
}: {
  id: string
  label: string
  hint: string
  error?: string
  icon: ReactNode
  children: ReactNode
}) {
  const descriptionId = `${id}-description`
  const errorId = `${id}-error`
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="flex items-center gap-2">
          <span className="text-muted-foreground" aria-hidden="true">
            {icon}
          </span>
          {label}
        </Label>
        <span id={descriptionId} className="text-xs text-muted-foreground">
          {hint}
        </span>
      </div>
      {children}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function TripForm({
  initialValues,
  fieldErrors = {},
  errorMessage,
  isLoading,
  onChange,
  onSubmit,
}: TripFormProps) {
  const [values, setValues] = useState<TripFormFields>(initialValues)
  const [localErrors, setLocalErrors] = useState<TripFieldErrors>({})
  const [suggestions, setSuggestions] = useState<
    Record<LocationFieldKey, LocationSuggestion[]>
  >({
    current_location: [],
    pickup_location: [],
    dropoff_location: [],
  })
  const [selectedSuggestions, setSelectedSuggestions] = useState<
    Partial<Record<LocationFieldKey, LocationSuggestion>>
  >({})
  const [isSuggesting, setIsSuggesting] = useState<
    Partial<Record<LocationFieldKey, boolean>>
  >({})
  const [unsupportedCountry, setUnsupportedCountry] = useState<
    Partial<Record<LocationFieldKey, boolean>>
  >({})
  const [openSuggestionsFor, setOpenSuggestionsFor] =
    useState<LocationFieldKey | null>(null)

  const debounceRef = useRef<Partial<Record<LocationFieldKey, number>>>({})
  const abortRef = useRef<Partial<Record<LocationFieldKey, AbortController>>>({})
  const closeMenuRef = useRef<number | null>(null)

  useEffect(() => {
    const debounceTimers = debounceRef.current
    const abortControllers = abortRef.current
    return () => {
      for (const key of Object.keys(debounceTimers) as LocationFieldKey[]) {
        const timerId = debounceTimers[key]
        if (timerId) window.clearTimeout(timerId)
      }
      for (const key of Object.keys(abortControllers) as LocationFieldKey[]) {
        abortControllers[key]?.abort()
      }
      if (closeMenuRef.current) window.clearTimeout(closeMenuRef.current)
    }
  }, [])

  const update = <Key extends keyof TripFormFields>(
    key: Key,
    value: TripFormFields[Key],
  ) => {
    const next = { ...values, [key]: value }
    setValues(next)
    setLocalErrors((current) => ({ ...current, [key]: undefined }))
    onChange(next)
    if (!isLocationField(key)) return

    setSelectedSuggestions((current) => ({ ...current, [key]: undefined }))
    setOpenSuggestionsFor(key)
    setSuggestions((current) => ({ ...current, [key]: [] }))
    setUnsupportedCountry((current) => ({ ...current, [key]: false }))
    const timerId = debounceRef.current[key]
    if (timerId) window.clearTimeout(timerId)
    abortRef.current[key]?.abort()

    const query = String(value ?? "").trim()
    if (query.length < 3 || isLoading) {
      setIsSuggesting((current) => ({ ...current, [key]: false }))
      return
    }

    debounceRef.current[key] = window.setTimeout(async () => {
      const controller = new AbortController()
      abortRef.current[key] = controller
      setIsSuggesting((current) => ({ ...current, [key]: true }))
      try {
        const result = await fetchLocationSuggestions(query, controller.signal)
        if (controller.signal.aborted) return
        setSuggestions((current) => ({ ...current, [key]: result.suggestions }))
        setUnsupportedCountry((current) => ({
          ...current,
          [key]: result.unsupportedCountry,
        }))
        if (result.unsupportedCountry) {
          setLocalErrors((current) => ({ ...current, [key]: US_ADDRESSES_ONLY }))
        }
      } catch {
        setSuggestions((current) => ({ ...current, [key]: [] }))
        setUnsupportedCountry((current) => ({ ...current, [key]: false }))
      } finally {
        setIsSuggesting((current) => ({ ...current, [key]: false }))
      }
    }, 260)
  }

  const pickSuggestion = (key: LocationFieldKey, suggestion: LocationSuggestion) => {
    const nextValues = { ...values, [key]: suggestion.label }
    setValues(nextValues)
    setLocalErrors((current) => ({ ...current, [key]: undefined }))
    setSelectedSuggestions((current) => ({ ...current, [key]: suggestion }))
    setSuggestions((current) => ({ ...current, [key]: [] }))
    setUnsupportedCountry((current) => ({ ...current, [key]: false }))
    setOpenSuggestionsFor(null)
    onChange(nextValues)
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const errors = validate(values)
    for (const field of locationFields) {
      if (unsupportedCountry[field.key] && !selectedSuggestions[field.key]) {
        errors[field.key] = US_ADDRESSES_ONLY
      }
    }
    setLocalErrors(errors)
    if (Object.keys(errors).length) {
      const firstInvalid = Object.keys(errors)[0]
      window.requestAnimationFrame(() => {
        document.getElementById(firstInvalid)?.focus()
      })
      return
    }
    const cleaned: TripFormFields = {
      ...values,
      current_location: values.current_location.trim(),
      pickup_location: values.pickup_location.trim(),
      dropoff_location: values.dropoff_location.trim(),
      current_cycle_used_hours: Number(values.current_cycle_used_hours),
    }
    const request: TripPlanRequest = {
      current_location: toLocationInput(
        cleaned.current_location,
        selectedSuggestions.current_location,
      ),
      pickup_location: toLocationInput(
        cleaned.pickup_location,
        selectedSuggestions.pickup_location,
      ),
      dropoff_location: toLocationInput(
        cleaned.dropoff_location,
        selectedSuggestions.dropoff_location,
      ),
      current_cycle_used_hours: cleaned.current_cycle_used_hours,
    }
    onSubmit({ values: cleaned, request })
  }

  const errors = { ...fieldErrors, ...localErrors }

  return (
    <main id="main-content" className="mx-auto w-full max-w-[680px] px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
      <div className="mb-8 max-w-xl">
        <h1 className="text-balance text-[2rem] font-semibold leading-[1.08] tracking-[-0.04em] text-foreground sm:text-[2.65rem]">
          Plan the drive. Know when to stop.
        </h1>
        <p className="mt-3 max-w-lg text-base leading-6 text-muted-foreground sm:text-lg">
          Enter three places and your current cycle hours. Milemark builds a compliant route and daily logs.
        </p>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border bg-muted/30">
          <CardTitle>Trip details</CardTitle>
          <CardDescription>
            Use a U.S. city, address, or recognizable place for each stop.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-5 md:pt-6">
          <form className="space-y-5" onSubmit={submit} noValidate>
            {errorMessage ? (
              <Alert variant="destructive">
                <span className="mt-1 size-2 rounded-full bg-current" aria-hidden="true" />
                <AlertTitle>Trip couldn’t be planned</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            ) : null}

            {locationFields.map(({ key, label, hint, Icon, ...field }) => (
              <FormField
                key={key}
                id={key}
                label={label}
                hint={hint}
                error={
                  openSuggestionsFor === key && unsupportedCountry[key]
                    ? undefined
                    : errors[key]
                }
                icon={<Icon className="size-4" />}
              >
                <div className="relative">
                  <Input
                    id={key}
                    name={key}
                    value={values[key]}
                    onFocus={() => setOpenSuggestionsFor(key)}
                    onBlur={() => {
                      closeMenuRef.current = window.setTimeout(
                        () => setOpenSuggestionsFor(null),
                        120,
                      )
                    }}
                    onChange={(event) => update(key, event.target.value)}
                    disabled={isLoading}
                    aria-invalid={Boolean(errors[key])}
                    aria-describedby={cn(`${key}-description`, errors[key] && `${key}-error`)}
                    {...field}
                    autoComplete="off"
                  />
                  {selectedSuggestions[key] ? (
                    <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Check className="size-3" />
                      Using this address
                    </p>
                  ) : null}
                  {openSuggestionsFor === key &&
                  !isLoading &&
                  (isSuggesting[key] ||
                    suggestions[key].length > 0 ||
                    unsupportedCountry[key]) ? (
                    <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-card shadow-card">
                      {isSuggesting[key] ? (
                        <p className="px-3 py-2 text-xs text-muted-foreground">
                          Searching addresses...
                        </p>
                      ) : unsupportedCountry[key] && suggestions[key].length === 0 ? (
                        <p className="px-3 py-2 text-xs text-destructive">
                          {US_ADDRESSES_ONLY}
                        </p>
                      ) : (
                        <ul>
                          {suggestions[key].map((suggestion) => (
                            <li key={`${suggestion.label}-${suggestion.latitude}`}>
                              <button
                                type="button"
                                className="flex w-full px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
                                onMouseDown={(event) => {
                                  event.preventDefault()
                                  if (closeMenuRef.current) {
                                    window.clearTimeout(closeMenuRef.current)
                                  }
                                  pickSuggestion(key, suggestion)
                                }}
                              >
                                <span className="line-clamp-2">{suggestion.label}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </div>
              </FormField>
            ))}

            <FormField
              id="current_cycle_used_hours"
              label="Current cycle used"
              hint="0–70 hours"
              error={errors.current_cycle_used_hours}
              icon={<Clock3 className="size-4" />}
            >
              <div className="relative">
                <Input
                  id="current_cycle_used_hours"
                  name="current_cycle_used_hours"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={70}
                  step="0.25"
                  value={values.current_cycle_used_hours}
                  onChange={(event) =>
                    update(
                      "current_cycle_used_hours",
                      event.target.value === "" ? Number.NaN : event.target.valueAsNumber,
                    )
                  }
                  disabled={isLoading}
                  aria-invalid={Boolean(errors.current_cycle_used_hours)}
                  aria-describedby={cn(
                    "current_cycle_used_hours-description",
                    errors.current_cycle_used_hours && "current_cycle_used_hours-error",
                  )}
                  className="pr-16 tabular-nums"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-muted-foreground">
                  hours
                </span>
              </div>
            </FormField>

            <Button type="submit" size="lg" className="mt-2 w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <LoaderCircle className="animate-spin motion-reduce:animate-none" />
                  Building your trip…
                </>
              ) : (
                <>
                  Plan my trip
                  <ArrowRight />
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="mt-5 flex items-start gap-2.5 px-1 text-xs leading-5 text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          Plans use standard U.S. property-carrier HOS rules, include 1 hour at pickup and drop-off, and add fuel at least every 1,000 miles.
        </p>
      </div>
    </main>
  )
}
