import { Skeleton } from "@/components/ui/skeleton"

// Shown instantly on navigation (loading.tsx) while the server renders the page. Shaped like what comes, so nothing
// jumps: lists = toolbar + rows, records = identity + stats + main column and right rail (patterns.md §8).
export function PageSkeleton() {
  return (
    <div className="grid min-w-0 gap-6" aria-busy="true">
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-(--control) w-full sm:w-64" />
        <Skeleton className="h-(--control) w-28" />
        <Skeleton className="h-(--control) w-40 sm:ml-auto" />
      </div>
      <div className="grid gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  )
}

export function RecordSkeleton() {
  return (
    <div className="grid min-w-0 gap-6" aria-busy="true">
      <div className="grid gap-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="grid content-start gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
        <div className="grid content-start gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}
