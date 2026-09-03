import * as React from "react"

import { cn } from "@/lib/utils"

const ScrollArea = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("relative overflow-auto overscroll-contain", className)}
      {...props}
    >
      {children}
    </div>
  ),
)
ScrollArea.displayName = "ScrollArea"

export { ScrollArea }
