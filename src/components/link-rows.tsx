import Link from "next/link"
import { ChevronRightIcon, type LucideIcon } from "lucide-react"

export type LinkRow = {
  key: string
  href: string
  icon?: LucideIcon
  title: React.ReactNode
  detail?: React.ReactNode
  badge?: React.ReactNode
}

/**
 * A short list of linked records inside a section (docs/design/patterns.md §3: `icon · label · muted detail · ›`):
 * the "Verknüpft" card of a record (order ↔ payment ↔ invoice ↔ cash entry), related documents. Rows ≥ 44 px.
 */
export function LinkRows({ rows }: { rows: LinkRow[] }) {
  return (
    <ul className="grid divide-y rounded-lg border">
      {rows.map((r) => (
        <li key={r.key}>
          <Link href={r.href} className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm hover:bg-muted active:bg-muted">
            {r.icon && <r.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
            <span className="grid min-w-0 flex-1">
              <span className="truncate font-medium">{r.title}</span>
              {r.detail && <span className="truncate text-xs text-muted-foreground">{r.detail}</span>}
            </span>
            {r.badge}
            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  )
}
