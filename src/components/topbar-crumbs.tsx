"use client"

import { useEffect, useSyncExternalStore } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
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
const STACK = "roots-nav"
const readStack = (): string[] => {
  try {
    return JSON.parse(sessionStorage.getItem(STACK) ?? "[]")
  } catch {
    return []
  }
}
function useNavStack() {
  const path = usePathname()
  useEffect(() => {
    const s = readStack()
    if (s.at(-1) === path) return
    if (s.at(-2) === path) s.pop()
    else s.push(path)
    try {
      sessionStorage.setItem(STACK, JSON.stringify(s.slice(-50)))
    } catch {}
  }, [path])
}

/**
 * In the top bar: the shown page's crumbs, else the area › page title. Phones: a back chevron to the parent when the
 * page is deeper than an area page, and only the current page's name (one line).
 */
export function TopbarTitle({ groups, children }: { groups: NavGroup[]; children: React.ReactNode }) {
  const t = useT()
  const crumbs = useSyncExternalStore(subscribe, () => current, () => null)
  const back = backTarget(crumbs, groups, usePathname())
  const router = useRouter()
  useNavStack()
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-sm">
      {back && (
        <Link
          href={back.href}
          onClick={(e) => {
            if (readStack().length < 2) return
            e.preventDefault()
            router.back()
          }}
          aria-label={t("shell.backTo", { label: back.label })}
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
