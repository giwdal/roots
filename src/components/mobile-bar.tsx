"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { HomeIcon, MenuIcon, SearchIcon } from "lucide-react"
import { useT } from "@/i18n/client"
import { APP_HOME, appRoute } from "@/lib/url"
import { cn } from "@/lib/utils"

const TAB =
  "relative flex min-h-11 min-w-0 touch-manipulation select-none flex-col items-center justify-center gap-0.5 overflow-hidden rounded-full py-1.5 text-[11px] transition [-webkit-tap-highlight-color:transparent] active:scale-95"

/**
 * Phones: a floating glass capsule (Start · Suche · Menü); the page's primary action sits beside it as a round button
 * (PageHeader, data-slot="page-primary"). Shrinks to icons while scrolling down. Hiding rules: `bar-hide` in globals.css.
 */
export function MobileBar({ unread = 0 }: { unread?: number }) {
  const t = useT()
  const home = appRoute(usePathname()) === "/"
  const nav = useRef<HTMLElement>(null)
  const proxy = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let last = window.scrollY
    let anchor = last // where the current downward run started
    let frame = 0
    const read = () => {
      frame = 0
      const y = Math.max(0, window.scrollY)
      if (y < last) {
        nav.current?.removeAttribute("data-compact")
        anchor = y
      } else if (y > last && y - anchor > 24) nav.current?.setAttribute("data-compact", "")
      if (y <= last) anchor = Math.min(anchor, y)
      last = y
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read)
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <>
    <input ref={proxy} aria-hidden tabIndex={-1} enterKeyHint="search" className="pointer-events-none fixed top-0 left-0 size-px opacity-0 md:hidden" />
    <nav
      ref={nav}
      aria-label={t("shell.tabs")}
      data-slot="mobile-bar"
      data-active={home ? "" : undefined}
      className="bar-hide group/bar fixed bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] left-4 right-4 z-30 flex justify-center md:hidden [body[data-page-primary]_&]:right-[calc(1rem+3.625rem+0.75rem)] [body[data-page-primary]_&]:justify-start"
    >
      <div
        className={cn(
          "glass grid w-[78%] gap-1.5 rounded-full p-1.5 transition-[width,grid-template-columns] duration-300 motion-reduce:transition-none",
          "grid-cols-[1fr_1fr_1fr] [body[data-page-primary]_&]:w-full",
          // compact: with Start active only its icon stays; elsewhere all three icons without labels
          "group-data-[compact]/bar:w-44 group-data-[active]/bar:group-data-[compact]/bar:w-[3.75rem] group-data-[active]/bar:group-data-[compact]/bar:grid-cols-[1fr_0fr_0fr] group-data-[active]/bar:group-data-[compact]/bar:gap-0",
          "group-data-[compact]/bar:[body[data-page-primary]_&]:w-44",
        )}
      >
        <Link href={APP_HOME} aria-current={home ? "page" : undefined} className={cn(TAB, home ? "font-medium text-foreground" : "text-muted-foreground")}>
          {home && <span aria-hidden className="absolute inset-0 rounded-full bg-foreground/[0.07]" />}
          <HomeIcon className="relative size-5" />
          <span className="relative group-data-[compact]/bar:hidden">{t("shell.home")}</span>
        </Link>
        <button
          type="button"
          onClick={() => {
            // iOS only opens the keyboard for a focus inside the tap itself: focus a stand-in now, the search sheet's
            // field takes the focus (and the open keyboard) over once it is there.
            proxy.current?.focus()
            document.dispatchEvent(new Event("roots:search"))
          }}
          className={cn(TAB, "text-muted-foreground")}
        >
          <SearchIcon className="size-5" />
          <span className="group-data-[compact]/bar:hidden">{t("shell.search")}</span>
        </button>
        <button
          type="button"
          aria-label={unread ? t("shell.menuUnread") : undefined}
          onClick={() => document.dispatchEvent(new Event("roots:menu"))}
          className={cn(TAB, "text-muted-foreground")}
        >
          <span className="relative">
            <MenuIcon className="size-5" />
            {unread > 0 && <span aria-hidden className="absolute -top-0.5 -right-1 size-2.5 rounded-full bg-destructive ring-2 ring-background" />}
          </span>
          <span className="group-data-[compact]/bar:hidden">{t("shell.menu")}</span>
        </button>
      </div>
    </nav>
    </>
  )
}
