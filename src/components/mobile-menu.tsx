"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, IdCardIcon, LanguagesIcon, LogOutIcon, SearchIcon, UserIcon } from "lucide-react"
import { openMyMemberArea } from "@/app/(app)/actions"
import { signOut } from "@/app/login/actions"
import type { Me, SidebarLink } from "@/components/app-sidebar"
import { ContentSheet, ContentSheetClose, ContentSheetTitle } from "@/components/content-sheet"
import { setLocale } from "@/i18n/actions"
import { useT } from "@/i18n/client"
import { localeNames, locales } from "@/i18n/config"
import { activeChildHref, appRoute, within } from "@/lib/url"
import { cn } from "@/lib/utils"

type Group = { label?: string; items: SidebarLink[] }

const TAP = "touch-manipulation [-webkit-tap-highlight-color:transparent] transition active:scale-95"
const TILE = `relative flex h-[4.5rem] w-full min-w-0 flex-col items-center justify-center gap-1 rounded-xl border bg-card px-1 text-xs [&_svg]:size-5 ${TAP}`
const ACTIVE = "border-primary/20 bg-primary/10 [&_svg]:text-primary"
const ROW = `flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm active:bg-muted [&_svg]:size-5 [&_svg]:text-muted-foreground ${TAP}`

const manyChildren = (n: SidebarLink) => (n.children?.length ?? 0) > 1

/**
 * Phones: the "Menü" tab opens this bottom sheet instead of the sidebar. Level 1 = org switcher, search, the areas as
 * tiles (same `groups` as the sidebar), account rows; an area with sub-pages drills into level 2 (big rows).
 * Opens on the "roots:menu" event, always at level 1.
 */
// switchOrgs: more than one org to choose from (several memberships, or a platform admin) – otherwise no org row.
export function MobileMenu({ header, switchOrgs, groups, me }: { header: React.ReactNode; switchOrgs: boolean; groups: Group[]; me: Me }) {
  const t = useT()
  const router = useRouter()
  const pathname = appRoute(usePathname())
  const [open, setOpen] = useState(false)
  const [area, setArea] = useState<string | null>(null) // href of the area shown at level 2
  const [pending, start] = useTransition()
  const heading = useRef<HTMLHeadingElement>(null)

  const items = groups.flatMap((g) => g.items)
  const activeChild = (n: SidebarLink) => activeChildHref(n.children ?? [], pathname)
  const isActive = (n: SidebarLink) => (n.children ? !!activeChild(n) : within(pathname, n.href))

  // Always opens at level 1 (the tiles), never drilled into the current area.
  useEffect(() => {
    const show = () => {
      setArea(null)
      setOpen(true)
    }
    document.addEventListener("roots:menu", show)
    return () => document.removeEventListener("roots:menu", show)
  }, [])

  // Moving between levels: focus the new level's heading.
  useEffect(() => heading.current?.focus(), [area, open])

  if (!open) return null
  const current = area ? items.find((n) => n.href === area) : undefined

  const search = () => {
    setOpen(false)
    document.dispatchEvent(new Event("roots:search"))
  }

  return (
    <ContentSheet
      onClose={() => {}}
      onClosed={() => setOpen(false)}
      label={t("shell.menu")}
      closeButton={false}
      header={
        current ? (
          <div className="flex items-center gap-2">
            <button type="button" aria-label={t("shell.menu")} onClick={() => setArea(null)} className="-ml-2 flex h-9 shrink-0 items-center rounded-lg pr-2 text-sm text-muted-foreground active:bg-muted [&_svg]:size-5">
              <ChevronLeftIcon /> {t("shell.menu")}
            </button>
            <ContentSheetTitle ref={heading} tabIndex={-1} className="flex min-w-0 items-center gap-2 text-lg font-semibold outline-none [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-primary">
              {current.icon} <span className="truncate">{current.label}</span>
            </ContentSheetTitle>
          </div>
        ) : null
      }
    >
      {current ? (
        <div className="grid gap-4 p-4">
          <ul className="divide-y rounded-xl border">
            {current.children?.map((c) => {
              const on = c.href === activeChild(current)
              return (
                <li key={c.href}>
                  <ContentSheetClose
                    nativeButton={false}
                    render={<Link href={c.href} aria-current={on ? "page" : undefined} />}
                    className={cn("flex h-13 w-full items-center gap-2 px-4 text-sm active:bg-muted", on && "bg-primary/10 font-medium")}
                  >
                    <span className="flex-1 truncate">{c.label}</span>
                    {on ? <CheckIcon className="size-4 text-primary" /> : <ChevronRightIcon className="size-4 text-muted-foreground" />}
                  </ContentSheetClose>
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <div className="grid gap-4 p-4">
          {/* Level 1 needs no visible title (the grab handle says "sheet"); screen readers still get one. */}
          <ContentSheetTitle ref={heading} tabIndex={-1} className="sr-only">
            {t("shell.menu")}
          </ContentSheetTitle>
          {switchOrgs && header}
          <button type="button" onClick={search} className={cn("flex h-11 w-full items-center gap-2 rounded-xl border px-3 text-sm text-muted-foreground", TAP)}>
            <SearchIcon className="size-4" /> {t("search.open")}
          </button>
          {groups.map((g, i) => (
            <section key={i} aria-label={g.label ?? t("shell.mainNav")} className="grid gap-2">
              {g.label && <h3 className="px-1 text-xs font-medium text-muted-foreground">{g.label}</h3>}
              <div className="grid grid-cols-3 gap-2">
                {g.items.map((n) => {
                  const on = isActive(n)
                  const body = (
                    <>
                      {n.icon}
                      <span className="max-w-full truncate">{n.label}</span>
                      {!!n.count && <span className="absolute top-1 right-1 min-w-5 rounded-full bg-muted px-1.5 text-center text-[10px] text-muted-foreground tabular-nums">{n.count}</span>}
                    </>
                  )
                  const cls = cn(TILE, on && ACTIVE)
                  if (manyChildren(n))
                    return (
                      <button key={n.href} type="button" onClick={() => setArea(n.href)} className={cls}>
                        {body}
                      </button>
                    )
                  if (n.newTab)
                    return (
                      <ContentSheetClose key={n.href} nativeButton={false} render={<a href={n.href} target="_blank" rel="noreferrer" />} className={cls}>
                        {body}
                      </ContentSheetClose>
                    )
                  return (
                    <ContentSheetClose key={n.href} nativeButton={false} render={<Link href={n.href} aria-current={on ? "page" : undefined} />} className={cls}>
                      {body}
                    </ContentSheetClose>
                  )
                })}
              </div>
            </section>
          ))}
          <div className="grid gap-1 border-t pt-3">
            <p className="truncate px-3 text-xs text-muted-foreground">{me.name !== me.email ? `${me.name} · ${me.email}` : me.email}</p>
            <ContentSheetClose nativeButton={false} render={<Link href="/settings/profile" />} className={ROW}>
              <UserIcon /> {t("account.link")}
            </ContentSheetClose>
            {me.memberArea && (
              <form action={openMyMemberArea}>
                <button type="submit" className={ROW}>
                  <IdCardIcon /> {t("account.memberArea")}
                </button>
              </form>
            )}
            <div className="flex h-12 items-center gap-3 px-3 text-sm [&_svg]:size-5 [&_svg]:text-muted-foreground">
              <LanguagesIcon />
              <span className="flex-1">{t("common.language")}</span>
              <div role="group" aria-label={t("common.language")} className="flex gap-1 rounded-lg bg-muted p-1">
                {locales.map((l) => (
                  <button
                    key={l}
                    type="button"
                    disabled={pending}
                    aria-pressed={l === t.locale}
                    onClick={() =>
                      start(async () => {
                        await setLocale(l)
                        router.refresh()
                      })
                    }
                    className={cn("h-9 min-w-11 rounded-md px-3 text-xs", l === t.locale ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
                  >
                    {localeNames[l]}
                  </button>
                ))}
              </div>
            </div>
            <form action={signOut}>
              <button type="submit" className={ROW}>
                <LogOutIcon /> {t("auth.signOut")}
              </button>
            </form>
          </div>
        </div>
      )}
    </ContentSheet>
  )
}
