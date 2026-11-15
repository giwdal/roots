"use client"

import { useEffect, useSyncExternalStore } from "react"
import { PageCrumbs } from "@/components/page-crumbs"

// The top bar's "where am I". A record page registers its crumbs while it is shown (effect: also cleaned up when
// Next keeps a visited page alive hidden in the background), and the top bar shows them instead of area › page.
type Crumbs = { href?: string; label: string }[] | null
let current: Crumbs = null
const listeners = new Set<() => void>()
const set = (c: Crumbs) => ((current = c), listeners.forEach((l) => l()))
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))

/** In a record page's header: put these crumbs into the top bar while the page is shown. */
export function TopbarCrumbs({ items }: { items: { href?: string; label: string }[] }) {
  const key = JSON.stringify(items)
  useEffect(() => {
    set(JSON.parse(key))
    return () => set(null)
  }, [key])
  return null
}

/** In the top bar: the shown page's crumbs, else the area › page title. */
export function TopbarTitle({ children }: { children: React.ReactNode }) {
  const crumbs = useSyncExternalStore(subscribe, () => current, () => null)
  return <div className="min-w-0 flex-1 overflow-hidden text-sm">{crumbs ? <PageCrumbs items={crumbs} /> : children}</div>
}
