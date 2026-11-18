import Link from "next/link"
import { BellIcon, CheckCheckIcon, InboxIcon } from "lucide-react"
import { AreaIcon } from "@/components/area-icon"
import { ListToolbar, Pager, pageRange, PAGE_SIZE } from "@/components/data-table"
import { FilterMenu } from "@/components/filter-menu"
import { Notice } from "@/components/notice"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { Segments } from "@/components/segments"
import { SubmitButton } from "@/components/submit-button"
import { renderEvent } from "@/events/render"
import { eventTypes } from "@/events/registry"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"
import { pageParam, param, withParams } from "@/lib/url"
import { NAV } from "@/modules/nav"
import { markAllRead } from "./actions"

// The nav area an event type belongs to (its module's area), for the icon and the filter; org/platform events: none.
const areaOf = (module: string) => NAV.find((a) => a.children.some((c) => [c.module].flat().includes(module)))

// Personal inbox across all orgs (and platform events for superadmins), like Linear's inbox: newest day first, unread
// before read within a day, filter by read state and area; a row opens the record (switching org visibly).
export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const ctx = await getContext()
  const t = await getT()
  const sp = await searchParams
  const unreadOnly = param(sp, "filter") === "unread"
  const area = NAV.find((a) => a.key === param(sp, "area"))
  const page = pageParam(sp)
  const typesOf = (key: string) => eventTypes.filter((e) => e.audience && areaOf(e.module)?.key === key).map((e) => e.key)

  // Unscoped client: the inbox spans all of the person's orgs (RLS: own rows only).
  const db = await createClient()
  let query = db
    .from("notifications")
    .select(`id, read_at, created_at, org_id, orgs(name), events:hub_events${area ? "!inner" : ""}(type, payload)`)
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .range(...pageRange(page))
  if (unreadOnly) query = query.is("read_at", null)
  if (area) query = query.in("events.type", typesOf(area.key))
  const { data } = await query
  const rows = (data ?? []).slice(0, PAGE_SIZE) as unknown as { id: number; read_at: string | null; created_at: string; org_id: string | null; orgs: { name: string } | null; events: { type: string; payload: unknown } | null }[]

  // Day groups (Heute, Gestern, then the date), unread first inside a day.
  const dayKey = (iso: string) => t.date(iso, { year: "numeric", month: "2-digit", day: "2-digit" })
  const today = dayKey(new Date().toISOString())
  const yesterday = dayKey(new Date(new Date().getTime() - 86_400_000).toISOString())
  const days = [...new Set(rows.map((r) => dayKey(r.created_at)))].map((d) => ({
    key: d,
    label: d === today ? t("inbox.today") : d === yesterday ? t("inbox.yesterday") : t.date(rows.find((r) => dayKey(r.created_at) === d)!.created_at, { weekday: "long", day: "numeric", month: "long" }),
    rows: rows.filter((r) => dayKey(r.created_at) === d).sort((a, b) => Number(!!a.read_at) - Number(!!b.read_at)),
  }))
  // Filter options: areas of event types this person can be told about (modules on).
  const areas = NAV.filter((a) => eventTypes.some((e) => e.audience && areaOf(e.module)?.key === a.key && ctx.modules.has(e.module)))
  const hasUnread = rows.some((r) => !r.read_at) || unreadOnly

  return (
    <Page size="form">
      <PageHeader
        icon={InboxIcon}
        title={t("inbox.title")}
        settings={{ href: "/settings/notifications", label: t("inbox.settings") }}
        actions={
          hasUnread && (
            <form action={markAllRead}>
              <SubmitButton variant="outline" size="sm">
                <CheckCheckIcon /> <span className="max-md:sr-only">{t("inbox.markAllRead")}</span>
              </SubmitButton>
            </form>
          )
        }
      />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <ListToolbar>
        <Segments
          label={t("inbox.title")}
          items={[
            { href: withParams(sp, { filter: undefined, page: undefined }), label: t("inbox.all"), current: !unreadOnly },
            { href: withParams(sp, { filter: "unread", page: undefined }), label: t("inbox.unread"), current: unreadOnly },
          ]}
        />
        {areas.length > 1 && <FilterMenu param="area" label={t("inbox.area")} allLabel={t("inbox.allAreas")} options={areas.map((a) => ({ value: a.key, label: t.dynamic(a.label) }))} />}
      </ListToolbar>

      {days.length ? (
        days.map((d) => (
          <section key={d.key} className="grid gap-2" aria-label={d.label}>
            <h2 className="px-1 text-xs font-medium text-muted-foreground">{d.label}</h2>
            <ul className="divide-y rounded-xl border">
              {d.rows.map((n) => {
                const ev = n.events ? renderEvent(n.events, t.locale) : null
                const type = eventTypes.find((e) => e.key === n.events?.type)
                const a = type ? areaOf(type.module) : undefined
                const elsewhere = n.org_id && n.org_id !== ctx.org.id
                return (
                  <li key={n.id}>
                    <Link href={`/notifications/${n.id}`} prefetch={false} className="flex min-h-14 items-center gap-3 px-4 py-3 text-sm hover:bg-muted active:bg-muted">
                      <span className={cn("size-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-[var(--link)]")} aria-hidden />
                      {a ? <AreaIcon area={a.key} icon={a.icon} className="size-7" /> : <span className="grid size-7 shrink-0 place-items-center rounded-[0.35rem] bg-muted text-muted-foreground" aria-hidden><BellIcon className="size-4" /></span>}
                      <span className="grid min-w-0 flex-1">
                        <span className={cn("line-clamp-2", n.read_at ? "text-muted-foreground" : "font-medium")}>
                          {!n.read_at && <span className="sr-only">{t("inbox.unread")}: </span>}
                          {ev?.title ?? "–"}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {[ev?.label, n.org_id ? (elsewhere ? t("inbox.inOrg", { org: n.orgs?.name ?? "" }) : null) : t("admin.title")].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{t.date(n.created_at, { hour: "2-digit", minute: "2-digit" })}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      ) : (
        <EmptyState icon={InboxIcon} title={unreadOnly ? t("inbox.allRead") : t("inbox.empty")} text={t("inbox.emptyText")} />
      )}
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />
    </Page>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
