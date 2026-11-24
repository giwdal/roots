import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ListChecksIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react"
import { ActionsMenu, MenuLink } from "@/components/actions-menu"
import { ListToolbar, SearchBox } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { Segments } from "@/components/segments"
import { SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { restoreList } from "./actions"
import { GuestListTable, LIST_COLS } from "./table"

const VIEWS = ["upcoming", "past", "all"] as const

// Events › Gästelisten: lists of upcoming events and permanent ones (Kommend), past events' lists (Vergangen), or all.
// ?event=<id> narrows to one event (+ permanent lists); the trash (?trash=1) brings lists back with new tickets.
export default async function GuestListsPage({ searchParams }: PageProps<"/guestlists">) {
  const ctx = await requirePerm("guestlists.view")
  if (!ctx.modules.has("guestlists")) notFound()
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("guestlists.manage")
  const raw = param(sp, "event")
  const eventId = raw && /^[0-9a-f-]{36}$/.test(raw) ? raw : null
  if (param(sp, "new")) redirect(`/guestlists/new${eventId ? `?event=${eventId}` : ""}`) // old drawer link
  const trash = canManage && param(sp, "trash") === "1"
  const view = VIEWS.find((v) => v === param(sp, "view")) ?? "upcoming"
  const q = param(sp, "q")?.replace(/[%,()*]/g, "").trim()
  const since = new Date(new Date().getTime() - 2 * 86_400_000).toISOString()
  // ponytail: up to 500 lists filtered here (past/upcoming hangs on the event's date); paging once orgs have more.
  let lists = ctx.supabase.from("guest_lists").select(LIST_COLS).eq("org_id", ctx.org.id).order("created_at", { ascending: false }).limit(500)
  lists = trash ? lists.not("deleted_at", "is", null) : lists.is("deleted_at", null)
  if (eventId) lists = lists.or(`event_id.eq.${eventId},event_id.is.null`)
  if (q) lists = lists.ilike("name", `%${q}%`)
  const [{ data }, { count: any }, { data: ev }] = await Promise.all([
    lists,
    ctx.supabase.from("guest_lists").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).is("deleted_at", null),
    eventId ? ctx.supabase.from("events").select("title").eq("id", eventId).eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const upcoming = (l: NonNullable<typeof data>[number]) => !l.event_id || (l.events?.starts_at ?? "") >= since
  const rows = (data ?? []).filter((l) => trash || eventId || view === "all" || (view === "upcoming" ? upcoming(l) : !upcoming(l)))
  const newHref = `/guestlists/new${eventId ? `?event=${eventId}` : ""}`

  return (
    <Page>
      <PageHeader
        area="events"
        title={trash ? `${t("guestlists.title")} · ${t("guestlists.trashView")}` : t("guestlists.title")}
        menu={
          canManage && (
            <ActionsMenu>
              <MenuLink href={trash ? "/guestlists" : "/guestlists?trash=1"} icon={trash ? <ListChecksIcon /> : <Trash2Icon />}>
                {trash ? t("guestlists.title") : t("guestlists.trashView")}
              </MenuLink>
            </ActionsMenu>
          )
        }
        primary={canManage && !trash ? { href: newHref, label: t("guestlists.new") } : undefined}
      />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {(!!any || trash) && (
        <ListToolbar search={<SearchBox q={q} label={t("common.search")} keep={{ ...(trash && { trash: "1" }), ...(view !== "upcoming" && { view }), ...(eventId && { event: eventId }) }} />}>
          {ev && (
            <Button render={<Link href={`/guestlists${withParams(sp, { event: undefined })}`} aria-label={`${ev.title} – ${t("common.clear")}`} />} nativeButton={false} size="sm" variant="secondary">
              {ev.title} <XIcon />
            </Button>
          )}
          {!trash && !eventId && (
            <Segments label={t("guestlists.filter")} className="md:ml-auto" items={VIEWS.map((v) => ({ href: `/guestlists${withParams(sp, { view: v === "upcoming" ? undefined : v })}`, current: v === view, label: t(`guestlists.views.${v}`) }))} />
          )}
        </ListToolbar>
      )}
      {trash && <p className="text-sm text-muted-foreground">{t("guestlists.trashHint", { days: 30 })}</p>}
      <GuestListTable
        t={t}
        rows={rows}
        action={
          trash
            ? (l) => (
                <form action={restoreList}>
                  <input type="hidden" name="id" value={l.id} />
                  <SubmitButton size="sm" variant="outline">
                    {t("guestlists.restore")}
                  </SubmitButton>
                </form>
              )
            : undefined
        }
        empty={
          trash ? (
            t("guestlists.emptyTrash")
          ) : any ? (
            t("guestlists.noMatch")
          ) : (
            <EmptyState
              area="events"
              title={t("guestlists.empty")}
              text={t("guestlists.emptyText")}
              action={
                canManage && (
                  <Button render={<Link href={newHref} />} nativeButton={false} size="sm">
                    <PlusIcon /> {t("guestlists.new")}
                  </Button>
                )
              }
            />
          )
        }
      />
    </Page>
  )
}

export const instant = false
