"use client"

import Link from "next/link"
import { CalendarRangeIcon, CheckIcon, ChevronDownIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

/** The report's period presets as one dropdown (an action sheet on phones); picking one drops an own from/to range. */
export function PeriodMenu({ label, current, options }: { label: string; current: string; options: { value: string; label: string; active: boolean }[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" variant="outline" className="shrink-0" aria-label={`${label}: ${current}`} />}>
        <CalendarRangeIcon /> {current}
        <ChevronDownIcon className="opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" title={label} className="min-w-48">
        {options.map((o) => (
          <DropdownMenuItem key={o.value} render={<Link href={`/reports?p=${o.value}`} scroll={false} />}>
            <CheckIcon className={o.active ? "" : "invisible"} /> {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
