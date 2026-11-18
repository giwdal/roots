"use client"

import { usePathname } from "next/navigation"
import { Segments } from "@/components/segments"
import { appRoute } from "@/lib/url"

// The event's sub-views (Übersicht · Tickets · Lineup · Gästelisten) as one segmented row of path links.
export function EventViews({ label, items }: { label: string; items: { href: string; label: string }[] }) {
  const path = appRoute(usePathname())
  return (
    <Segments
      label={label}
      className="justify-self-start"
      items={items.map((it, i) => ({ ...it, current: i === 0 ? path === it.href : path.startsWith(it.href) }))}
    />
  )
}
