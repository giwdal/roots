"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { CheckIcon, ChevronDownIcon, ListFilterIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useT } from "@/i18n/client"

/**
 * A list filter as a dropdown button ("Tag ▾" → "Tag: Vorstand ▾"): writes `?<param>=<value>`, keeps the other
 * params, restarts paging. Use it next to the <SearchBox> instead of rows of chips. Phones: an action sheet titled
 * with the label (DropdownMenuContent). Phones, inside a <ListToolbar>: only a filter icon (a dot while a value is set)
 * beside the search field or the view switch, never a lone button on its own row.
 */
export function FilterMenu({ param, label, options, allLabel }: { param: string; label: string; options: { value: string; label: string }[]; allLabel?: string }) {
  const t = useT()
  const pathname = usePathname()
  const sp = useSearchParams()
  const current = sp.get(param)
  const href = (v: string | null) => {
    const p = new URLSearchParams(sp.toString())
    if (v) p.set(param, v)
    else p.delete(param)
    p.delete("page")
    return p.size ? `${pathname}?${p}` : pathname
  }
  const active = options.find((o) => o.value === current)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant={active ? "secondary" : "outline"} aria-label={active ? `${label}: ${active.label}` : label} className="relative shrink-0 max-md:in-data-[slot=list-toolbar]:w-(--control) max-md:in-data-[slot=list-toolbar]:px-0" />}
      >
        <ListFilterIcon className="hidden max-md:in-data-[slot=list-toolbar]:block" />
        {active && <span aria-hidden className="absolute top-1.5 right-1.5 hidden size-2 rounded-full bg-[var(--link)] max-md:in-data-[slot=list-toolbar]:block" />}
        <span className="max-md:in-data-[slot=list-toolbar]:sr-only">{active ? `${label}: ${active.label}` : label}</span>
        <ChevronDownIcon className="opacity-60 max-md:in-data-[slot=list-toolbar]:hidden" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" title={label} className="max-h-80 min-w-48 overflow-y-auto">
        <DropdownMenuItem render={<Link href={href(null)} scroll={false} />}>
          <CheckIcon className={active ? "invisible" : ""} /> {allLabel ?? t("common.all")}
        </DropdownMenuItem>
        {options.map((o) => (
          <DropdownMenuItem key={o.value} render={<Link href={href(o.value)} scroll={false} />}>
            <CheckIcon className={o.value === current ? "" : "invisible"} /> {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
