"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { FileIcon, FileTextIcon, LayoutGridIcon, Loader2Icon, SearchIcon, type LucideIcon } from "lucide-react"
import { AreaIcon } from "@/components/area-icon"
import { ContentSheet, ContentSheetClose, ContentSheetTitle } from "@/components/content-sheet"
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { useT } from "@/i18n/client"
import { usePhone } from "@/lib/use-phone"
import { NAV } from "@/modules/nav"
import { searchApp, type SearchGroup, type SearchItem } from "@/search/actions"

// Result group → the nav area whose colour tile it shows (same tile as in the sidebar); groups outside the areas
// (pages, files, letters) get a neutral tile with their own icon.
const AREA: Record<string, string> = {
  contacts: "contacts",
  members: "members",
  events: "events",
  invoices: "finance",
  forms: "communication",
  email: "communication",
  wiki: "wiki",
  projects: "projects",
  tasks: "projects",
  rentals: "rentals",
  products: "shop",
  shop_orders: "shop",
}
const OWN: Record<string, LucideIcon> = { pages: LayoutGridIcon, files: FileIcon, templates: FileTextIcon }

function GroupIcon({ group }: { group: string }) {
  const area = NAV.find((a) => a.key === AREA[group])
  return <AreaIcon area={area?.key ?? "none"} icon={area?.icon ?? OWN[group] ?? SearchIcon} />
}

// Recently opened hits (this browser only), shown before anything is typed.
type Recent = SearchItem & { group: string }
const RECENT_KEY = "roots-search-recent"
const readRecent = (): Recent[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as Recent[]
  } catch {
    return []
  }
}
const remember = (hit: Recent) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([hit, ...readRecent().filter((r) => r.href !== hit.href)].slice(0, 8)))
  } catch {}
}

/**
 * Global search over pages + records of the active org (server search as you type). From md: the ⌘K palette.
 * Phones (the tab bar's "Suche"): a sheet with the field on top, recent records below it, results grouped by area.
 */
export function CommandSearch() {
  const t = useT()
  const router = useRouter()
  const phone = usePhone()
  const { setOpenMobile } = useSidebar()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const [groups, setGroups] = useState<SearchGroup[]>([])
  const [recent, setRecent] = useState<Recent[]>([])
  const [pending, start] = useTransition()
  const latest = useRef("")

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    const show = () => setOpen(true) // the phone tab bar's "Suche"
    document.addEventListener("keydown", key)
    document.addEventListener("roots:search", show)
    return () => {
      document.removeEventListener("keydown", key)
      document.removeEventListener("roots:search", show)
    }
  }, [])

  useEffect(() => {
    if (open) setRecent(readRecent()) // eslint-disable-line react-hooks/set-state-in-effect -- browser storage, read on open
  }, [open])

  // Debounced server search; only the answer to the latest query is shown.
  useEffect(() => {
    const term = q.trim()
    latest.current = term
    if (!term) return
    const timer = setTimeout(
      () =>
        start(async () => {
          const res = await searchApp(term)
          if (latest.current === term) setGroups(res)
        }),
      180,
    )
    return () => clearTimeout(timer)
  }, [q])

  const reset = () => {
    setQ("")
    setGroups([])
  }
  const go = (hit: Recent) => {
    remember(hit)
    setOpen(false)
    setOpenMobile(false)
    reset()
    router.push(hit.href)
  }
  const shown = q.trim() ? groups : []
  const row = phone ? "min-h-12 gap-3 text-base" : undefined

  const body = (
    <CommandList className={phone ? "max-h-none flex-1 px-1 pb-4" : undefined}>
      {!q.trim() ? (
        recent.length ? (
          <CommandGroup heading={t("search.recent")}>
            {recent.map((it) => (
              <CommandItem key={it.href} value={`recent-${it.href}`} onSelect={() => go(it)} className={row}>
                <GroupIcon group={it.group} />
                <span className="truncate">{it.title}</span>
                {it.detail && <span className="ml-auto truncate text-xs text-muted-foreground">{it.detail}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("search.hint")}</p>
        )
      ) : pending && !shown.length ? (
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" /> {t("search.loading")}
        </p>
      ) : (
        <CommandEmpty>{t("search.empty")}</CommandEmpty>
      )}
      {shown.map((g) => (
        <CommandGroup key={g.key} heading={g.label}>
          {g.items.map((it) => (
            <CommandItem key={`${g.key}-${it.id}`} value={`${g.key}-${it.id}`} onSelect={() => go({ ...it, group: g.key })} className={row}>
              <GroupIcon group={g.key} />
              <span className="truncate">{it.title}</span>
              {it.detail && <span className="ml-auto truncate text-xs text-muted-foreground">{it.detail}</span>}
            </CommandItem>
          ))}
        </CommandGroup>
      ))}
    </CommandList>
  )

  if (phone)
    return open ? (
      <ContentSheet closeButton={false} header={null} label={t("search.open")} onClose={() => {}} onClosed={() => (setOpen(false), reset())}>
        <ContentSheetTitle className="sr-only">{t("search.open")}</ContentSheetTitle>
        <Command shouldFilter={false} className="min-h-0 flex-1 rounded-none! bg-transparent">
          <div className="flex items-center gap-1 pr-2">
            <div className="min-w-0 flex-1 [&_[data-slot=input-group]]:h-11!">
              <CommandInput value={q} onValueChange={setQ} placeholder={t("search.placeholder")} autoFocus enterKeyHint="search" />
            </div>
            <ContentSheetClose className="h-11 shrink-0 rounded-lg px-2 text-sm font-medium active:bg-muted">{t("common.cancel")}</ContentSheetClose>
          </div>
          {body}
        </Command>
      </ContentSheet>
    ) : null

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title={t("search.open")} description={t("search.hint")}>
      <Command shouldFilter={false}>
        <CommandInput value={q} onValueChange={setQ} placeholder={t("search.placeholder")} />
        {body}
      </Command>
    </CommandDialog>
  )
}

/** The sidebar's search row; the dialog itself lives once in the shell (the phone sidebar is a drawer and isn't mounted while closed). */
export function SearchButton() {
  const t = useT()
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton tooltip={`${t("search.open")} (⌘K)`} onClick={() => document.dispatchEvent(new Event("roots:search"))} className="text-muted-foreground">
          <SearchIcon />
          <span>{t("search.open")}</span>
          <kbd className="ml-auto rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">⌘K</kbd>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
