import Link from "next/link"
import { notFound } from "next/navigation"
import { CalendarClockIcon, CalendarIcon, FolderKanbanIcon, GraduationCapIcon, KeyRoundIcon, ListTodoIcon, PlaneIcon, type LucideIcon } from "lucide-react"
import { CalendarView } from "@/components/calendar-view"
import { LinkRows } from "@/components/link-rows"
import { Page, PageHeader } from "@/components/page"
import { UrlSheet } from "@/components/url-sheet"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { fromLocalInput } from "@/lib/time"
import { param, withParams } from "@/lib/url"
import { calendarEntries, COLOR, sourcesFor, type CalendarSource } from "@/calendar/sources"

const DAY = 86_400_000
const ICON: Record<CalendarSource, LucideIcon> = { events: CalendarIcon, shifts: CalendarClockIcon, absences: PlaneIcon, tasks: ListTodoIcon, projects: FolderKanbanIcon, rentals: KeyRoundIcon, courses: GraduationCapIcon }

// One calendar over every module the person sees (events, shifts, absences, tasks, projects, rentals, courses),
// coloured by source; the chips above (?src=events,shifts) choose which and are the legend. A click opens the record.
// "Neu" (header, an empty slot, the phone's day "+") opens ?new=entry: what to create on that day, in the modules the
// person may manage, each link carrying the day. Data: src/calendar/sources.ts.
export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const ctx = await getContext()
  const t = await getT()
  const sp = await searchParams
  const sources = sourcesFor(ctx)
  if (!sources.length) notFound()
  const picked = (param(sp, "src") ?? "").split(",").filter((s): s is CalendarSource => (sources as string[]).includes(s))
  const active = picked.length ? picked : sources
  // The visible range around ?date= (month view + air), so navigating months loads what it shows.
  const base = /^\d{4}-\d{2}-\d{2}$/.test(param(sp, "date") ?? "") ? new Date(`${param(sp, "date")}T12:00:00Z`) : new Date()
  const from = new Date(base.getTime() - 42 * DAY).toISOString()
  const to = new Date(base.getTime() + 70 * DAY).toISOString()
  const entries = await calendarEntries(ctx, t, from, to, active)

  // A chip toggles its source; all or none on = no filter.
  const toggle = (s: CalendarSource) => {
    const next = active.includes(s) ? active.filter((x) => x !== s) : [...active, s]
    return withParams(sp, { src: next.length && next.length < sources.length ? next.join(",") : undefined, new: undefined })
  }

  // ?new=entry: the day comes from the clicked slot (?start=), else the calendar's day, else today.
  const creating = param(sp, "new") === "entry"
  const start = param(sp, "start")
  const day = start ? new Date(start).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }) : /^\d{4}-\d{2}-\d{2}$/.test(param(sp, "date") ?? "") ? param(sp, "date")! : new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  const evening = fromLocalInput(`${day}T18:00`)?.toISOString() ?? ""
  const late = fromLocalInput(`${day}T22:00`)?.toISOString() ?? ""
  const q = (o: Record<string, string>) => new URLSearchParams(o).toString()
  const options: { source: CalendarSource; perm: string; href: string }[] = [
    { source: "events", perm: "events.manage", href: `/events/new?${q({ start: `${day}T18:00` })}` },
    { source: "shifts", perm: "shifts.manage", href: `/shifts?${q({ new: "shift", date: day, start: evening, end: late })}` },
    { source: "absences", perm: "hr.manage", href: `/hr/absences?${q({ new: "absence", date: day, start: day, end: day })}` },
    { source: "tasks", perm: "projects.manage", href: `/projects/tasks?${q({ new: "task", due: day })}` },
    { source: "projects", perm: "projects.manage", href: `/projects/new?${q({ start: day })}` },
    { source: "rentals", perm: "rentals.manage", href: `/rentals/r/new?${q({ start: evening, end: late })}` },
    { source: "courses", perm: "courses.manage", href: `/courses/new?${q({ start: evening })}` },
  ]
  const create = options.filter((c) => sources.includes(c.source) && ctx.can(c.perm))
  const newHref = withParams(sp, { new: "entry", start: undefined, end: undefined })

  return (
    <Page>
      <PageHeader area="calendar" title={t("calendar.title")} primary={create.length ? { href: newHref, label: t("calendar.new") } : undefined} />
      {sources.length > 1 && (
        <nav aria-label={t("calendar.sourcesLabel")} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          {sources.map((s) => {
            const on = active.includes(s)
            return (
              <Link
                key={s}
                href={toggle(s)}
                scroll={false}
                aria-pressed={on}
                className="inline-flex h-(--control-sm) shrink-0 touch-manipulation items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground aria-pressed:border-foreground/40 aria-pressed:bg-muted aria-pressed:text-foreground active:bg-muted"
              >
                <span className="size-2 rounded-full" style={{ background: on ? COLOR[s] : "transparent", boxShadow: `inset 0 0 0 1.5px ${COLOR[s]}` }} aria-hidden />
                {t.dynamic(`calendar.sources.${s}`)}
              </Link>
            )
          })}
        </nav>
      )}
      <CalendarView
        events={entries.map((e) => ({ id: `${e.source}-${e.id}`, title: e.title, start: e.starts_at, end: e.ends_at ?? e.starts_at, allDay: e.all_day, color: e.color, href: e.href, readOnly: true }))}
        views={["month", "week", "day", "agenda"]}
        defaultView="month"
        newHref={create.length ? newHref : undefined}
      />
      {creating && create.length > 0 && (
        <UrlSheet params={["new", "start", "end"]} compact title={t("calendar.newOn", { date: t.date(`${day}T12:00:00`, { weekday: "short", day: "numeric", month: "short" }) })} description={t("calendar.newHint")}>
          <LinkRows rows={create.map((c) => ({ key: c.source, href: c.href, icon: ICON[c.source], title: t.dynamic(`calendar.create.${c.source}`) }))} />
        </UrlSheet>
      )}
    </Page>
  )
}

export const instant = false
