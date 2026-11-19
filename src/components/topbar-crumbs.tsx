"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ChevronLeftIcon } from "lucide-react"
import { PageCrumbs } from "@/components/page-crumbs"
import { useT } from "@/i18n/client"
import { appRoute, within } from "@/lib/url"

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

type NavGroup = { items: { href: string; label: string; children?: { href: string; label: string }[] }[] }

/**
 * Where "back" goes on phones: the nearest linked crumb before the current one; without crumbs, the nav page this
 * path lies under (/shop/orders/<id> → Bestellungen) when the path is deeper than that page. Area pages: none.
 */
export function backTarget(crumbs: Crumbs, groups: NavGroup[], pathname: string): { href: string; label: string } | null {
  if (crumbs) {
    const parent = crumbs.slice(0, -1).reverse().find((c) => c.href)
    return parent?.href ? { href: parent.href, label: parent.label } : null
  }
  const path = appRoute(pathname)
  const pages = groups.flatMap((g) => g.items.flatMap((i) => [i, ...(i.children ?? [])]))
  const page = pages.filter((p) => appRoute(p.href) !== "/" && within(path, p.href)).sort((a, b) => appRoute(b.href).length - appRoute(a.href).length)[0]
  return page && appRoute(page.href) !== path ? { href: page.href, label: page.label } : null
}

// The App's own history of this tab (sessionStorage): like a native navigation stack, "back" returns to the screen
// the person came from inside the App (member → contact → back = member); only without one (deep link, reload of a
// first page) it falls back to the parent. Going back to the previous entry pops it, any other move pushes.
// Record pages also leave their name (last crumb) here, so the chevron can say where it really goes.
const STACK = "roots-nav"
const TITLES = "roots-nav-titles"
// The last full address (with its filters, view, open tab) of each screen in the stack: going back lands there.
const HREFS = "roots-nav-hrefs"
const read = <T,>(key: string, empty: T): T => {
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "null") ?? empty
  } catch {
    return empty
  }
}
const write = (key: string, value: unknown) => {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {}
}
const readStack = () => read<string[]>(STACK, [])

/** Keeps the stack and returns the previous screen's path (null = no App history: back goes to the parent). */
function useNavStack(path: string, title: string | undefined, search: string) {
  const [prev, setPrev] = useState<string | null>(null)
  useEffect(() => {
    const hrefs = read<Record<string, string>>(HREFS, {})
    // A sheet's own param (?edit=, ?new=, ?task=) isn't part of the screen to come back to.
    const q = new URLSearchParams(search)
    for (const k of ["edit", "new", "task", "connect", "ok", "error"]) q.delete(k)
    const href = q.size ? `${path}?${q}` : path
    if (hrefs[path] !== href) write(HREFS, Object.fromEntries(Object.entries({ ...hrefs, [path]: href }).slice(-50)))
  }, [path, search])
  useEffect(() => {
    const s = readStack()
    if (s.at(-1) !== path) {
      if (s.at(-2) === path) s.pop()
      else s.push(path)
      write(STACK, s.slice(-50))
    }
    setPrev(s.at(-2) ?? null) // eslint-disable-line react-hooks/set-state-in-effect -- sessionStorage only exists in the browser
  }, [path])
  useEffect(() => {
    if (!title) return
    const titles = read<Record<string, string>>(TITLES, {})
    if (titles[path] === title) return
    const keep = Object.entries({ ...titles, [path]: title }).slice(-50)
    write(TITLES, Object.fromEntries(keep))
  }, [path, title])
  return prev
}

/** The name of a screen in the stack: a record page's stored name, else its nav page; unknown = null. */
function screenName(path: string, groups: NavGroup[]): string | null {
  const stored = read<Record<string, string>>(TITLES, {})[path]
  if (stored) return stored
  const page = groups.flatMap((g) => g.items.flatMap((i) => [i, ...(i.children ?? [])])).find((p) => appRoute(p.href.split("?")[0]) === appRoute(path))
  return page?.label ?? null
}

/**
 * In the top bar: the shown page's crumbs, else the area › page title. Phones: a back chevron to the parent when the
 * page is deeper than an area page, and only the current page's name (one line).
 */
export function TopbarTitle({ groups, children }: { groups: NavGroup[]; children: React.ReactNode }) {
  const t = useT()
  const crumbs = useSyncExternalStore(subscribe, () => current, () => null)
  const path = usePathname()
  const back = backTarget(crumbs, groups, path)
  const router = useRouter()
  const search = useSearchParams().toString()
  const prev = useNavStack(path, crumbs?.at(-1)?.label, search)
  // With App history the chevron goes to the previous screen (its name if known, else just "Zurück"); without, to the parent.
  const prevName = prev && (back && appRoute(prev) === appRoute(back.href.split("?")[0]) ? back.label : screenName(prev, groups))
  const label = !prev ? t("shell.backTo", { label: back?.label ?? "" }) : prevName ? t("shell.backTo", { label: prevName }) : t("shell.back")
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-sm">
      {back && (
        <Link
          href={back.href}
          onClick={(e) => {
            // One tap = the previous screen, however many sheets/filters were opened here (browser history has an
            // entry for each of those, so history.back() needed many taps).
            const before = readStack().at(-2)
            if (!before) return
            e.preventDefault()
            router.push(read<Record<string, string>>(HREFS, {})[before] ?? before)
          }}
          aria-label={label}
          data-slot="topbar-back"
          className="-ml-2 grid size-9 shrink-0 touch-manipulation place-items-center rounded-lg [-webkit-tap-highlight-color:transparent] active:bg-muted md:hidden"
        >
          <ChevronLeftIcon className="size-5" />
        </Link>
      )}
      <div className="min-w-0 flex-1 overflow-hidden">
        {crumbs ? (
          <>
            <div className="max-md:hidden">
              <PageCrumbs items={crumbs} />
            </div>
            <span className="block truncate font-medium md:hidden">{crumbs.at(-1)?.label}</span>
          </>
        ) : (
          children
        )}
      </div>
    </div>
  )
}
