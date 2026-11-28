import Link from "next/link"
import { BulkBar } from "@/components/bulk-bar"
import { SubmitButton } from "@/components/submit-button"
import { bulkRestoreEvents, bulkTrashEvents } from "./actions"
import { notFound, redirect } from "next/navigation"
import { DataTable, ListToolbar, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { CalendarDaysIcon, PlusIcon, RotateCcwIcon, Trash2Icon } from "lucide-react"
import { Segments } from "@/components/segments"
import { ActionsMenu, MenuLink } from "@/components/actions-menu"
import { FilterMenu } from "@/components/filter-menu"
import { Notice } from "@/components/notice"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { pageParam, param, withParams } from "@/lib/url"
import { StatusBadge } from "./event-form"
import { TypeBadge } from "./type-badge"

const VIEWS = ["upcoming", "past", "all"] as const
const STATUSES = ["draft", "published", "cancelled"] as const

export default async function EventsPage({ searchParams }: PageProps<"/events">) {
  const ctx = await requirePerm("events.view")
  if (!ctx.modules.has("events")) notFound()
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("events.manage")
  const q = param(sp, "q")
    ?.replace(/[%,()*]/g, "")
    .trim()
  const trash = canManage && param(sp, "trash") === "1"
  const view = VIEWS.find((v) => v === param(sp, "view")) ?? "upcoming"
  const status = STATUSES.find((s) => s === param(sp, "status"))
  const page = pageParam(sp)
  const typeId = /^[0-9a-f-]{36}$/.test(param(sp, "type") ?? "") ? param(sp, "type") : undefined
  // Old drawer links (?edit=<id>) → the event's page.
  const editId = param(sp, "edit")
  if (editId && /^[0-9a-f-]{36}$/.test(editId)) redirect(`/events/${editId}`)
  if (param(sp, "new")) redirect("/events/new") // old drawer link

  // All filtering happens here in the query; the UI only writes the URL.
  const now = new Date().toISOString()
  // The one number per event: tickets out (sold + guest lists) against the capacity, counted in the same query.
  const tickets = !trash && ctx.modules.has("tickets") && ctx.can("tickets.view")
  let query = ctx.supabase
    .from("events")
    .select(`id, title, slug, status, starts_at, ends_at, venue_name, capacity, deleted_at, sold:tickets(count), event_types(name, color)`)
    .eq("org_id", ctx.org.id)
    .range(...pageRange(page))
  if (trash) query = query.not("deleted_at", "is", null).order("deleted_at", { ascending: false })
  else {
    query = query.is("deleted_at", null)
    if (view === "upcoming") query = query.or(`ends_at.gte.${now},and(ends_at.is.null,starts_at.gte.${now})`).order("starts_at")
    else if (view === "past")
      query = query.or(`ends_at.lt.${now},and(ends_at.is.null,starts_at.lt.${now})`).order("starts_at", { ascending: false })
    else query = query.order("starts_at", { ascending: false })
    if (status) query = query.eq("status", status)
  }
  if (q) query = query.or(`title.ilike.%${q}%,venue_name.ilike.%${q}%`)
  if (typeId) query = query.eq("event_type_id", typeId)
  if (tickets) query = query.in("sold.status", ["valid", "used"])
  const [{ data }, { data: typeList }] = await Promise.all([query, ctx.supabase.from("event_types").select("id, name").eq("org_id", ctx.org.id).order("name")])
  const rows = data?.slice(0, PAGE_SIZE) ?? []
  const counts = tickets ? new Map(rows.map((r) => [r.id, r.sold[0]?.count ?? 0])) : null
  const filtered = !!(q || status || typeId || view !== "upcoming")

  return (
    <Page>
      <PageHeader
        area="events"
        title={trash ? `${t("eventsPage.title")} · ${t("eventsPage.trash")}` : t("eventsPage.title")}
        menu={
          canManage && (
            <ActionsMenu>
              <MenuLink href={trash ? "/events" : "/events?trash=1"} icon={trash ? <CalendarDaysIcon /> : <Trash2Icon />}>
                {trash ? t("eventsPage.all") : t("eventsPage.trash")}
              </MenuLink>
            </ActionsMenu>
          )
        }
        primary={canManage && !trash ? { href: "/events/new", label: t("eventsPage.new") } : undefined}
      />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />

      <ListToolbar search={<SearchBox q={q} label={t("common.search")} />}>
        {!trash && (
          <>
            <Segments
              label={t("eventsPage.when")}
              items={VIEWS.map((v) => ({ href: withParams(sp, { view: v === "upcoming" ? undefined : v, page: undefined }), label: t.dynamic(`eventsPage.${v}`), current: v === view }))}
            />
            <FilterMenu param="status" label={t("eventsPage.status")} options={STATUSES.map((s) => ({ value: s, label: t.dynamic(`eventsPage.statuses.${s}`) }))} />
            {!!typeList?.length && <FilterMenu param="type" label={t("eventsPage.type")} options={typeList.map((x) => ({ value: x.id, label: x.name }))} />}
          </>
        )}
      </ListToolbar>
      {trash && <p className="text-sm text-muted-foreground">{t("eventsPage.trashHint", { days: 30 })}</p>}

      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `/events/${r.id}`}
        select={canManage ? { form: "bulk-events", label: t("common.select") } : undefined}
        empty={
          trash ? (
            t("eventsPage.emptyTrash")
          ) : filtered ? (
            t("eventsPage.noMatch")
          ) : (
            <EmptyState
              area="events"
              title={t("eventsPage.empty")}
              text={t("eventsPage.emptyText")}
              action={
                canManage && (
                  <Button render={<Link href="/events/new" />} nativeButton={false} size="sm">
                    <PlusIcon /> {t("eventsPage.new")}
                  </Button>
                )
              }
            />
          )
        }
        columns={[
          {
            header: t("eventsPage.event"),
            cell: (r) => (
              <span className="grid min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.title}</span>
                  <TypeBadge type={r.event_types} />
                </span>
                {r.venue_name && <span className="truncate text-xs text-muted-foreground">{r.venue_name}</span>}
              </span>
            ),
          },
          {
            header: t("eventsPage.when"),
            cell: (r) => t.date(r.starts_at, { dateStyle: "medium", timeStyle: "short" }),
            className: "whitespace-nowrap",
          },
          { header: t("eventsPage.status"), cell: (r) => <StatusBadge t={t} status={r.status} /> },
          ...(counts
            ? [
                {
                  header: t("tickets.title"),
                  cell: (r: (typeof rows)[number]) => `${counts.get(r.id) ?? 0}${r.capacity ? ` / ${r.capacity}` : ""}`,
                  className: "text-right tabular-nums",
                },
              ]
            : []),
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />
      {canManage && (
        <BulkBar form="bulk-events">
          {trash ? (
            <SubmitButton size="sm" variant="ghost" formAction={bulkRestoreEvents}>
              <RotateCcwIcon /> {t("eventsPage.restore")}
            </SubmitButton>
          ) : (
            <SubmitButton size="sm" variant="ghost" formAction={bulkTrashEvents} data-confirm="common.confirmTrashMany" className="text-destructive hover:text-destructive">
              <Trash2Icon /> {t("common.toTrash")}
            </SubmitButton>
          )}
        </BulkBar>
      )}
    </Page>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
