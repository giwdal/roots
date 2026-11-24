"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { within } from "@/lib/url"
import { cn } from "@/lib/utils"

type Item = { href: string; label: string }

// Sub-pages of a settings-like area beside the page, in labelled groups (Einstellungen: Du · Organisation). Desktop
// only: on phones the area's index page lists the same items as rows. Most specific match is current.
export function SectionNav({ label, groups, className }: { label: string; groups: { label?: string; items: Item[] }[]; className?: string }) {
  const pathname = usePathname()
  const current = groups
    .flatMap((g) => g.items)
    .filter((i) => within(pathname, i.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href
  return (
    <nav aria-label={label} className={cn("grid w-48 shrink-0 content-start gap-4", className)}>
      {groups.map((g, n) => (
        <div key={g.label ?? n} className="grid gap-0.5">
          {g.label && <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">{g.label}</p>}
          {g.items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              aria-current={i.href === current ? "page" : undefined}
              className="inline-flex h-(--control-sm) shrink-0 items-center rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-foreground"
            >
              {i.label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  )
}
