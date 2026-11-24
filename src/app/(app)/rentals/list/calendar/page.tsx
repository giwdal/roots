import { CalendarView } from "@/components/calendar-view"
import { ListToolbar } from "@/components/data-table"
import { Page, PageHeader } from "@/components/page"
import { getT } from "@/i18n/server"
import { rentalMarks } from "@/calendar/sources"
import { requirePerm } from "@/lib/context"
import { longTerm } from "@/rentals/fields"
import { peopleLine } from "../../parts"
import { RentalViews } from "../../views"

// Vergaben › Kalender (Belegung): rentable objects as columns (per object) or one calendar; requests lighter. Like the
// shared Kalender, month / week / list show long-term contracts as key dates; the per-object view keeps their bars.
// Click = the rental, empty slot / drag across = new booking for that object and time. Phones: week strip + day list.
export default async function RentalCalendarPage() {
  const ctx = await requirePerm("rentals.view")
  const t = await getT()
  const canManage = ctx.can("rentals.manage")
  const now = new Date()
  const from = new Date(now.getTime() - 120 * 86_400_000).toISOString()
  const [{ data: objects }, { data: rentals }] = await Promise.all([
    ctx.supabase.from("rental_objects").select("id, name").eq("org_id", ctx.org.id).is("deleted_at", null).eq("rentable", true).eq("status", "active").order("position").order("name").limit(200),
    ctx.supabase
      .from("rentals")
      .select("id, object_id, status, unit, starts_at, ends_at, renew_months, notice_months, notice_at, rental_objects!inner(name, rentable), rental_contacts(role, contacts(first_name, last_name, company, email))")
      .eq("org_id", ctx.org.id)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .eq("rental_objects.rentable", true)
      .or(`ends_at.is.null,ends_at.gte.${from}`)
      .limit(3000),
  ])
  // ponytail: open-ended contracts are drawn for a year from today; long enough for the views here.
  const horizon = new Date(now.getTime() + 365 * 86_400_000).toISOString()
  const titleOf = (r: NonNullable<typeof rentals>[number]) => `${r.rental_objects.name} · ${peopleLine(r.rental_contacts, 1) || "–"}${r.status === "request" ? ` (${t("rentals.states.request")})` : ""}`
  const base = (r: NonNullable<typeof rentals>[number]) => ({ color: r.status === "request" ? "var(--chart-4)" : "var(--chart-1)", href: `/rentals/r/${r.id}`, resourceId: r.object_id, readOnly: true })
  // Per object (resource view): every booking as a bar, long contracts included, so the occupancy shows.
  const bars = (rentals ?? []).map((r) => ({ ...base(r), id: r.id, title: titleOf(r), start: r.starts_at, end: r.ends_at ?? horizon }))
  // Month / week / list follow the shared Kalender: long-term contracts only as their key dates (start, notice, end).
  const items = (rentals ?? []).flatMap((r) =>
    longTerm(r.unit)
      ? rentalMarks(r).map(([d, kind]) => ({ ...base(r), id: `${r.id}-${kind}`, title: `${titleOf(r)} · ${t.dynamic(`calendar.rentalMarks.${kind}`)}`, start: `${d}T00:00:00`, end: `${d}T23:59:00`, allDay: true }))
      : [{ ...base(r), id: r.id, title: titleOf(r), start: r.starts_at, end: r.ends_at ?? horizon }],
  )
  return (
    <Page>
      <PageHeader area="rentals" title={t("rentals.tabs.rentals")} primary={canManage ? { href: "/rentals/r/new", label: t("rentals.newRentalAny") } : undefined} />
      <ListToolbar>
        <RentalViews t={t} current="calendar" />
      </ListToolbar>
      <CalendarView
        events={items}
        resourceEvents={bars}
        resources={(objects ?? []).map((o) => ({ id: o.id, title: o.name }))}
        views={["resource", "month", "week", "agenda"]}
        defaultView="month"
        newHref={canManage ? "/rentals/r/new?x=1" : undefined}
        newMinutes={120}
      />
    </Page>
  )
}

export const instant = false
