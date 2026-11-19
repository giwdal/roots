import type { ReactNode } from "react"
import { PhoneMore } from "@/components/phone-more"
import { cn } from "@/lib/utils"

export type DetailItem = { label: ReactNode; value: ReactNode }

// A record's facts: label above value on phones, two aligned columns from `sm`. `phoneLimit`: on phones only the
// first n facts show, the rest behind "n weitere" (record pages' Eigenschaften, mobile.md).
export function DetailList({ items, className, phoneLimit }: { items: (DetailItem | false | "" | 0 | null | undefined)[]; className?: string; phoneLimit?: number }) {
  const real = items.filter(Boolean) as DetailItem[]
  if (phoneLimit && real.length > phoneLimit + 1)
    return (
      <div className="grid gap-y-3 sm:gap-y-2">
        <DetailList items={real.slice(0, phoneLimit)} className={className} />
        <PhoneMore count={real.length - phoneLimit}>
          <DetailList items={real.slice(phoneLimit)} className={className} />
        </PhoneMore>
      </div>
    )
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
