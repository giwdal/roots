import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type DetailItem = { label: ReactNode; value: ReactNode }

// A record's facts: label above value on phones, two aligned columns from `sm`.
export function DetailList({ items, className }: { items: (DetailItem | false | "" | 0 | null | undefined)[]; className?: string }) {
  return (
    <dl className={cn("grid gap-y-3 text-sm sm:grid-cols-[minmax(7rem,max-content)_minmax(0,1fr)] sm:gap-x-6 sm:gap-y-2", className)}>
      {items.map((item, i) =>
        item ? (
          <div key={i} className="contents">
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd className="min-w-0 break-words">{item.value == null || item.value === "" ? "–" : item.value}</dd>
          </div>
        ) : null,
      )}
    </dl>
  )
}
