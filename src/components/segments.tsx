import Link from "next/link"
import { cn } from "@/lib/utils"

/**
 * A small set of views of the same list (≤ 5: Kommend · Vergangen · Alle, Board · Liste) as one segmented control of
 * links. Same look as <Choice> segments. Phones: one row that scrolls sideways, never wraps. Only as wide as its items; on its own (not in a toolbar) it sits on the right. More options or data-driven ones → <FilterMenu>.
 */
export function Segments({ label, items, className }: { label: string; items: { href: string; label: React.ReactNode; current: boolean }[]; className?: string }) {
  return (
    <nav aria-label={label} className={cn("no-scrollbar flex w-fit max-w-full shrink-0 gap-1 justify-self-end overflow-x-auto rounded-lg bg-muted p-1 md:flex-wrap", className)}>
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          scroll={false}
          aria-current={it.current ? "true" : undefined}
          className="inline-flex min-h-7 shrink-0 touch-manipulation items-center gap-1.5 rounded-md px-3 whitespace-nowrap max-md:min-h-8 text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=true]:bg-background aria-[current=true]:font-medium aria-[current=true]:text-foreground aria-[current=true]:shadow-sm [&_svg]:size-3.5"
        >
          {it.label}
        </Link>
      ))}
    </nav>
  )
}
