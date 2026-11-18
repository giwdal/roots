"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { FileIcon, FileTextIcon, LayoutGridIcon, Loader2Icon, PlusIcon, ScanLineIcon, SearchIcon, type LucideIcon } from "lucide-react"
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
  employees: "hr",
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

// The typed part of a title in bold, so people see why a row matched.
function mark(text: string, q: string) {
  const i = q ? text.toLocaleLowerCase().indexOf(q.toLocaleLowerCase()) : -1
  if (i < 0) return text
  return (
    <>
      {text.slice(0, i)}
      <span className="font-semibold text-foreground">{text.slice(i, i + q.length)}</span>
      {text.slice(i + q.length)}
    </>
  )
}

/**
 * Global search over pages + records of the active org (server search as you type). From md: the ⌘K palette.
 * Phones (the tab bar's "Suche"): a sheet with the field on top, recent records below it, results grouped by area.
 */
export function CommandSearch({ areas = [], quick = [] }: { areas?: { href: string; label: string; icon: React.ReactNode }[]; quick?: { href: string; label: string }[] }) {
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
  const row = phone ? "min-h-12 text-base" : undefined
  // One result row: area tile, the title with the typed part in bold, a muted detail on the right.
  const hit = (it: SearchItem, group: string) => (
    <>
      <GroupIcon group={group} />
      <span className="min-w-0 truncate">{mark(it.title, q.trim())}</span>
      {it.detail && <span className="ml-auto max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">{it.detail}</span>}
    </>
  )

  const body = (
    <CommandList className={phone ? "max-h-none flex-1 px-1 pb-4" : undefined}>
      {!q.trim() ? (
        <>
          {recent.length > 0 && (
            <CommandGroup heading={t("search.recent")}>
              {recent.map((it) => (
                <CommandItem key={it.href} value={`recent-${it.href}`} onSelect={() => go(it)} className={row}>
                  {hit(it, it.group)}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {quick.length > 0 && (
            <CommandGroup heading={t("search.quick")}>
              {quick.map((a) => (
                <CommandItem key={a.href} value={`quick-${a.href}`} onSelect={() => (setOpen(false), reset(), router.push(a.href))} className={row}>
                  <span className="grid size-5 shrink-0 place-items-center rounded-[0.35rem] bg-muted text-muted-foreground">{a.href === "/scan" ? <ScanLineIcon className="size-3.5" /> : <PlusIcon className="size-3.5" />}</span>
                  <span className="truncate">{a.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {/* Before typing: where you can go (the areas this person has), like a launcher. */}
          {areas.length > 0 && (
            <CommandGroup heading={t("search.goTo")}>
              {areas.map((a) => (
                <CommandItem key={a.href} value={`area-${a.href}`} onSelect={() => go({ id: a.href, title: a.label, href: a.href, group: "pages" })} className={row}>
                  <span className="grid size-5 shrink-0 place-items-center [&_svg]:size-4">{a.icon}</span>
                  <span className="truncate">{a.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </>
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
              {hit(it, g.key)}
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
    <CommandDialog open={open} onOpenChange={setOpen} title={t("search.open")} description={t("search.hint")} className="top-[12vh] sm:max-w-[40rem]">
      <Command shouldFilter={false}>
        <CommandInput value={q} onValueChange={setQ} placeholder={t("search.placeholder")} />
        <div className="[&_[data-slot=command-list]]:max-h-[min(60vh,28rem)]">{body}</div>
        <div className="flex items-center gap-4 border-t px-4 py-2 text-xs text-muted-foreground [&_kbd]:rounded [&_kbd]:border [&_kbd]:bg-muted [&_kbd]:px-1 [&_kbd]:font-mono [&_kbd]:text-[10px]">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> {t("search.keysMove")}
          </span>
          <span>
            <kbd>↵</kbd> {t("search.keysOpen")}
          </span>
          <span className="ml-auto">
            <kbd>esc</kbd> {t("common.close")}
          </span>
        </div>
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
