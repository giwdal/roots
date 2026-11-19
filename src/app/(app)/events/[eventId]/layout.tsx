import { notFound } from "next/navigation"
import { CalendarClockIcon, ExternalLinkIcon, EyeOffIcon, PencilIcon, RotateCcwIcon, ScanLineIcon, SendIcon, Trash2Icon, UndoIcon, XCircleIcon } from "lucide-react"
import { ActionsMenu, MenuLink, MenuSeparator, MenuSubmit } from "@/components/actions-menu"
import { SubmitButton } from "@/components/submit-button"
import { Page, PageHeader } from "@/components/page"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { siteUrl } from "@/lib/url"
import { InlineTitle } from "@/components/inline-title"
import { patchEvent, restoreEvent, setEventStatus, trashEvent } from "../actions"
import { StatusBadge } from "../event-form"
import { EventViews } from "./event-views"

// One event: a compact status header (status, date, place; the next step as the primary button), the sub-views as
// one segmented row, then the page. Shifts and the door are their own areas, linked filtered to this event.
export default async function EventLayout({ children, params }: { children: React.ReactNode; params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  if (!/^[0-9a-f-]{36}$/.test(eventId)) notFound()
  const ctx = await requirePerm("events.view")
  if (!ctx.modules.has("events")) notFound()
  const t = await getT()
  const { data: ev } = await ctx.supabase
    .from("events")
    .select("id, title, slug, status, starts_at, ends_at, venue_name, deleted_at, locations(name)")
    .eq("id", eventId)
    .eq("org_id", ctx.org.id)
    .maybeSingle()
  if (!ev) notFound()
  const on = (m: string, p: string) => ctx.modules.has(m) && ctx.can(p)
  const canManage = ctx.can("events.manage")
  const canDoor = on("tickets", "tickets.scan") || on("guestlists", "guestlists.checkin")
  const live = !ev.deleted_at
  const base = `/events/${ev.id}`
  const sameDay = ev.ends_at && t.date(ev.ends_at, { dateStyle: "short" }) === t.date(ev.starts_at, { dateStyle: "short" })
  // One date format for start and end (weekday, day, month), the end's date only when it's another day.
  const full = { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" } as const
  const when = `${t.date(ev.starts_at, full)}${ev.ends_at ? ` – ${t.date(ev.ends_at, sameDay ? { hour: "2-digit", minute: "2-digit" } : full)}` : ""}`
  const place = ev.venue_name ?? ev.locations?.name
  const statusForm = (status: string) => (
    <form id={`ev-status-${status}`} action={setEventStatus} hidden>
      <input type="hidden" name="id" value={ev.id} />
      <input type="hidden" name="status" value={status} />
    </form>
  )
  const views = [
    { href: base, label: t("nav.overview") },
    ...(on("tickets", "tickets.view") ? [{ href: `${base}/tickets`, label: t("tickets.title") }] : []),
    { href: `${base}/lineup`, label: t("eventsPage.views.lineup") },
    ...(on("guestlists", "guestlists.view") ? [{ href: `${base}/guestlists`, label: t("guestlists.title") }] : []),
  ]

  return (
    <Page size="record">
      <PageHeader
        crumbs={[{ href: "/events", label: t("eventsPage.nav") }, { label: ev.title }]}
        title={live && canManage ? <InlineTitle action={patchEvent} id={ev.id} field="title" name={ev.title} label={t("eventsPage.titleLabel")} /> : ev.title}
        badge={live ? <StatusBadge t={t} status={ev.status} /> : <StatusBadge t={t} status="trashed" />}
        meta={
          <>
            <span>{when}</span>
            {place && <span>· {place}</span>}
          </>
        }
        actions={
          live && (
            <>
              {ev.status !== "draft" && (
                <Button render={<a href={siteUrl(ctx.org.slug, `/e/${ev.slug}`, ctx.org.site_domain)} target="_blank" rel="noreferrer" />} nativeButton={false} size="sm" variant="outline">
                  <ExternalLinkIcon /> {t("eventsPage.publicLink")}
                </Button>
              )}
            </>
          )
        }
        menu={
          live &&
          (canManage || on("shifts", "shifts.view") || canDoor) && (
            <ActionsMenu>
              {canDoor && ev.status !== "published" && (
                <MenuLink href={`/scan?event=${ev.id}`} icon={<ScanLineIcon />}>
                  {t("tickets.scanNav")}
                </MenuLink>
              )}
              {on("shifts", "shifts.view") && (
                <MenuLink href={`/shifts?event=${ev.id}`} icon={<CalendarClockIcon />}>
                  {t("shifts.title")}
                </MenuLink>
              )}
              {canManage && (
                <MenuLink href={`${base}?edit=${ev.id}`} icon={<PencilIcon />}>
                  {t("common.editAll")}
                </MenuLink>
              )}
              {canManage && ev.status === "published" && (
                <MenuSubmit form="ev-status-draft" icon={<EyeOffIcon />} confirm="eventsPage.confirmUnpublish">
                  {t("eventsPage.unpublish")}
                </MenuSubmit>
              )}
              {canManage && ev.status === "cancelled" && (
                <MenuSubmit form="ev-status-draft" icon={<UndoIcon />}>
                  {t("eventsPage.uncancel")}
                </MenuSubmit>
              )}
              {canManage && (
                <>
                  <MenuSeparator />
                  {ev.status === "published" && (
                    <MenuSubmit form="ev-status-cancelled" icon={<XCircleIcon />} destructive confirm="eventsPage.confirmCancel">
                      {t("eventsPage.cancel")}
                    </MenuSubmit>
                  )}
                  <MenuSubmit form="trash-event" icon={<Trash2Icon />} destructive>
                    {t("eventsPage.toTrash")}
                  </MenuSubmit>
                </>
              )}
            </ActionsMenu>
          )
        }
        primary={
          !canManage && !canDoor ? undefined : !live ? (
            canManage && (
              <form action={restoreEvent}>
                <input type="hidden" name="id" value={ev.id} />
                <SubmitButton size="sm">
                  <RotateCcwIcon /> {t("eventsPage.restore")}
                </SubmitButton>
              </form>
            )
          ) : ev.status === "draft" ? (
            canManage && (
              <form action={setEventStatus}>
                <input type="hidden" name="id" value={ev.id} />
                <input type="hidden" name="status" value="published" />
                <SubmitButton size="sm">
                  <SendIcon /> {t("eventsPage.publish")}
                </SubmitButton>
              </form>
            )
          ) : ev.status === "published" && canDoor ? (
            { href: `/scan?event=${ev.id}`, label: t("tickets.scanNav"), icon: ScanLineIcon }
          ) : undefined
        }
      />
      {canManage && live && (
        <>
          {statusForm("draft")}
          {statusForm("cancelled")}
          <form id="trash-event" action={trashEvent} hidden>
            <input type="hidden" name="id" value={ev.id} />
          </form>
        </>
      )}
      {live && views.length > 1 && <EventViews label={ev.title} items={views} />}
      {children}
    </Page>
  )
}

export const instant = false
