import { notFound } from "next/navigation"
import { CalendarView } from "@/components/calendar-view"
import { FilterMenu } from "@/components/filter-menu"
import { Page, PageHeader } from "@/components/page"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { param } from "@/lib/url"
import { calendarEntries, sourcesFor, type CalendarSource } from "@/calendar/sources"

const DAY = 86_400_000

// One calendar over every module the person sees (events, shifts, tasks, projects, rentals, courses), coloured by
// source; ?src= narrows it to one. A click opens the record. Data: src/calendar/sources.ts.
export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const ctx = await getContext()
  const t = await getT()
  const sp = await searchParams
  const sources = sourcesFor(ctx)
  if (!sources.length) notFound()
  const src = sources.find((s) => s === param(sp, "src"))
  // The visible range around ?date= (month view + air), so navigating months loads what it shows.
  const base = /^\d{4}-\d{2}-\d{2}$/.test(param(sp, "date") ?? "") ? new Date(`${param(sp, "date")}T12:00:00Z`) : new Date()
  const from = new Date(base.getTime() - 42 * DAY).toISOString()
  const to = new Date(base.getTime() + 70 * DAY).toISOString()
  const entries = await calendarEntries(ctx, t, from, to, src ? [src] : sources)
  return (
    <Page>
      <PageHeader area="calendar" title={t("calendar.title")} />
      <div className="flex flex-wrap items-center gap-3">
        <FilterMenu param="src" label={t("calendar.source")} options={sources.map((s: CalendarSource) => ({ value: s, label: t.dynamic(`calendar.sources.${s}`) }))} />
      </div>
      <CalendarView
        events={entries.map((e) => ({ id: `${e.source}-${e.id}`, title: e.title, start: e.starts_at, end: e.ends_at ?? e.starts_at, allDay: e.all_day, color: e.color, href: e.href, readOnly: true }))}
        views={["month", "week", "day", "agenda"]}
        defaultView="month"
      />
    </Page>
  )
}

export const instant = false
