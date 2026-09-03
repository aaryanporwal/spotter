import { Route } from "lucide-react"

import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function PlanLoading() {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/90 px-4 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-label="Building your route and daily logs"
    >
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="items-center pb-3 text-center">
          <div className="mb-2 grid size-11 place-items-center rounded-full bg-primary text-primary-foreground">
            <Route className="size-5" />
          </div>
          <p className="font-semibold tracking-[-0.01em]">Building your trip</p>
          <p className="text-sm text-muted-foreground">Routing stops, rest, and daily logs…</p>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
        </CardContent>
      </Card>
    </div>
  )
}
