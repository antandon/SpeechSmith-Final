import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root>
>(({ className, value, ...props }, ref) => {
  // Fill up from empty the first time the bar scrolls into view.
  const rootRef = React.useRef<HTMLDivElement>(null)
  const [seen, setSeen] = React.useState(false)
  React.useImperativeHandle(ref, () => rootRef.current!)
  React.useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setSeen(true); observer.disconnect() }
    })
    observer.observe(rootRef.current!)
    return () => observer.disconnect()
  }, [])

  return (
    <ProgressPrimitive.Root
      ref={rootRef}
      className={cn(
        "relative h-4 w-full overflow-hidden rounded-full bg-slate-200",
        className
      )}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full w-full flex-1 bg-primary transition-transform duration-1000 ease-out motion-reduce:transition-none"
        style={{ transform: `translateX(-${100 - (seen ? value || 0 : 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
})
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }
