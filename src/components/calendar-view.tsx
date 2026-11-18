"use client"

import { useMemo } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { format, isSameMonth, isSameYear, subMilliseconds, type Locale } from "date-fns"
import { de, enGB } from "date-fns/locale"
import { toast } from "sonner"
import { EventCalendar } from "@/components/reui/event-calendar/event-calendar"
import { EventCalendarContent } from "@/components/reui/event-calendar/event-calendar-content"
import { EventCalendarNav } from "@/components/reui/event-calendar/event-calendar-nav"
import type { CalendarEvent, CalendarView as View, EventCalendarResource } from "@/components/reui/event-calendar/event-calendar-types"
import { useT } from "@/i18n/client"
import { usePhone } from "@/lib/use-phone"

// Generic calendar for any module (shifts, events, bookings…), built on the ReUI event calendar (src/components/reui).
// - View + date live in the URL (?view=week&date=2026-10-12), so every view is shareable and survives reload.
// - Click an entry → its href (usually "?edit=<id>" / "?shift=<id>" opening a drawer). Click an empty slot (default
//   length `newMinutes`) or drag across a range → newHref + &start=…&end=…(&resource=…) to create something there.
// - Optional drag & drop: `onMove` (a server action) gets the new times; it returns an error text to reject.
// - "resource" view = one column per person/room; pass `resourceEvents` (entries with resourceId) for it.
export type CalendarItem = { id: string; title: string; start: string; end: string; allDay?: boolean; color?: string; href?: string; resourceId?: string; readOnly?: boolean }

type Opts = { locale?: Locale }
// "16.–22. November 2026", "30. Nov. – 6. Dez. 2026", across years with both years.
const span = (a: Date, b: Date, opts: Opts = {}) =>
  isSameMonth(a, b) ? `${format(a, "d.", opts)}–${format(b, "d. MMMM yyyy", opts)}` : isSameYear(a, b) ? `${format(a, "d. MMM", opts)} – ${format(b, "d. MMM yyyy", opts)}` : `${format(a, "d. MMM yyyy", opts)} – ${format(b, "d. MMM yyyy", opts)}`
const rangeTitle = (view: string, { date, activeRange, locale }: { date: Date; activeRange: { start: Date; end: Date }; locale?: Locale }) =>
  view === "month" ? format(date, "MMMM yyyy", { locale }) : view === "day" || view === "resource" ? format(date, "EEEE, d. MMMM yyyy", { locale }) : span(activeRange.start, subMilliseconds(activeRange.end, 1), { locale })
const eventTime = (start: Date, end: Date, allDay: boolean, opts: Opts = {}) => {
  if (allDay) return ""
  const sameDay = format(start, "yyyy-MM-dd") === format(subMilliseconds(end, 1), "yyyy-MM-dd")
  return sameDay ? `${format(start, "HH:mm", opts)}–${format(end, "HH:mm", opts)}` : `${format(start, "d.M. HH:mm", opts)} – ${format(end, "d.M. HH:mm", opts)}`
}

export function CalendarView({
  events,
  resourceEvents,
  resources,
  views = ["month", "week", "day", "agenda"],
  defaultView = "week",
  newHref,
  onMove,
  newMinutes = 240,
  className = "h-[70dvh] min-h-[480px]",
  viewParam = "view",
}: {
  events: CalendarItem[]
  resourceEvents?: CalendarItem[]
  resources?: EventCalendarResource[]
  views?: View[]
  defaultView?: View
  newHref?: string
  onMove?: (id: string, start: string, end: string) => Promise<{ error?: string } | void>
  /** Length of a new entry when an empty slot is clicked (dragging picks the length). */
  newMinutes?: number
  className?: string
  /** URL param for the calendar's own view (month/week…), when the page already uses ?view= for something else. */
  viewParam?: string
}) {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const phone = usePhone()
  // Phones open on the list (agenda) when the page offers it: a 7-column week grid can't be read at 375 px. A chosen
  // view in the URL always wins; week/month stay one tap away.
  const fallback = phone && views.includes("agenda") && (defaultView === "week" || defaultView === "month") ? "agenda" : defaultView
  const view = (views.find((v) => v === sp.get(viewParam)) ?? fallback) as View
  const dateParam = sp.get("date")
  const date = useMemo(() => (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? new Date(`${dateParam}T12:00:00`) : new Date()), [dateParam])
  const source = view === "resource" && resourceEvents ? resourceEvents : events
  const items: CalendarEvent<{ href?: string }>[] = useMemo(
    () =>
      source.map((e) => ({
        id: e.id,
        title: e.title,
        start: new Date(e.start),
        end: new Date(e.end),
        color: e.color,
        allDay: e.allDay,
        resourceId: e.resourceId,
        readOnly: e.readOnly ?? !onMove,
        data: { href: e.href },
      })),
    [source, onMove],
  )

  const setParams = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp)
    for (const [k, v] of Object.entries(patch)) next.set(k, v)
    router.replace(`${pathname}?${next}`, { scroll: false })
  }
  const go = (href: string) => router.push(href.startsWith("?") ? `${pathname}${href}` : href, { scroll: false })
  const iso = (d: Date) => d.toISOString()
  const create = (start: Date, end: Date, resourceId?: string) =>
    go(`${newHref}&start=${encodeURIComponent(iso(start))}&end=${encodeURIComponent(iso(end))}${resourceId ? `&resource=${resourceId}` : ""}`)
  const day = (d: Date) => d.toLocaleDateString("sv-SE")

  return (
    <EventCalendar<{ href?: string }>
      events={items}
      view={view}
      date={date}
      views={views}
      resources={view === "resource" ? resources : undefined}
      locale={t.locale === "de" ? de : enGB}
      timeZone="Europe/Berlin"
      weekStartsOn={1}
      dayStartHour={0}
      dayEndHour={24}
      interactions={{ drag: !!onMove, resize: !!onMove, selectSlot: !!newHref }}
      i18n={{
        ...(t.locale === "de"
          ? {
              labels: { today: "Heute", allDay: "Ganztägig", noEvents: "Keine Einträge", more: (n: number) => `+${n} weitere` },
              viewNames: { month: "Monat", week: "Woche", day: "Tag", days: (n: number) => `${n} Tage`, agenda: "Liste", resource: "Personen" },
            }
          : { viewNames: { agenda: "List", resource: "People" } }),
        // European dates and 24 h times in both languages (16.–22. November 2026, 18:00), never "7 vorm.".
        formats: {
          dayTitle: "EEEE, d. MMMM yyyy",
          timeGridDayHeader: "EEE d.",
          agendaDayHeader: "EEEE, d. MMMM",
          moreDayHeader: "EEEE, d. MMMM",
          timeGutter: "HH:mm",
          timeGutterMinute: "HH:mm",
          eventTime: "HH:mm",
        },
        functions: { formatTitle: rangeTitle, formatEventTime: eventTime, formatDayRange: (range, opts) => span(range.start, subMilliseconds(range.end, 1), opts) },
      }}
      onViewChange={(v) => setParams({ [viewParam]: v })}
      onDateChange={(d) => setParams({ date: day(d) })}
      onEventClick={(occ, e) => {
        const href = occ.event.data?.href
        if (href) {
          e.preventDefault()
          go(href)
        }
      }}
      onSlotClick={(slot) => {
        if (!newHref) return
        // All-day / month cell: evening by default; time grid: the clicked time + newMinutes.
        const start = slot.allDay ? new Date(new Date(slot.date).setHours(18, 0, 0, 0)) : slot.date
        create(start, new Date(start.getTime() + newMinutes * 60_000), slot.resourceId)
      }}
      onSelectSlot={(draft) => {
        if (!newHref) return
        const start = draft.allDay ? new Date(new Date(draft.start).setHours(18, 0, 0, 0)) : draft.start
        const end = draft.allDay ? new Date(start.getTime() + newMinutes * 60_000) : draft.end
        create(start, end, draft.resourceId)
      }}
      onEventUpdate={
        onMove
          ? (u) => {
              onMove(String(u.event.id), iso(u.start), iso(u.end)).then((r) => {
                if (r && "error" in r && r.error) {
                  toast.error(r.error)
                  router.refresh()
                } else router.refresh()
              })
              return true
            }
          : undefined
      }
      className={className}
    >
      <EventCalendarNav />
      <EventCalendarContent />
    </EventCalendar>
  )
}
