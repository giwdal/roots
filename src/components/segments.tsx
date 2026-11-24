import Link from "next/link"
import { cn } from "@/lib/utils"

/**
 * A small set of views of the same list (≤ 5: Kommend · Vergangen · Alle, Board · Liste) as one segmented control of
 * links. Same look as <Choice> segments. Phones: the full width, every view visible in equal parts (never cut off,
 * never scrolling); from md only as wide as its items. More options or data-driven ones → <FilterMenu>.
 */
export function Segments({ label, items, className }: { label: string; items: { href: string; label: React.ReactNode; current: boolean }[]; className?: string }) {
  return (
    <nav aria-label={label} data-slot="segments" className={cn("relative grid w-full auto-cols-fr grid-flow-col gap-1 rounded-lg bg-muted p-1 md:flex md:w-fit md:max-w-full md:shrink-0 md:flex-wrap md:justify-self-end", className)}>
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          scroll={false}
          aria-current={it.current ? "true" : undefined}
          className="inline-flex h-[calc(var(--control)-0.5rem)] min-w-0 touch-manipulation items-center justify-center gap-1.5 truncate rounded-md px-2 whitespace-nowrap text-sm md:shrink-0 md:px-3 text-muted-foreground transition-colors hover:text-foreground aria-[current=true]:bg-background aria-[current=true]:font-medium aria-[current=true]:text-foreground aria-[current=true]:shadow-sm [&_svg]:size-4"
        >
          {it.label}
        </Link>
      ))}
    </nav>
  )
}
