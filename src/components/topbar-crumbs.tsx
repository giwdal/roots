"use client"

import { useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { PageCrumbs } from "@/components/page-crumbs"

const noop = () => () => {}

/** A record page's way back ("Vermietung › Studio 1 › Mietvertrag") shown in the top bar instead of the area title. */
export function TopbarCrumbs({ items }: { items: { href?: string; label: string }[] }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false)
  const slot = mounted ? document.getElementById("topbar-crumbs") : null
  return slot ? createPortal(<PageCrumbs items={items} />, slot) : null
}
