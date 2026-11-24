// The shared calendar: dated things from every module in one shape (CalendarEntry), read through the person's own
// client (RLS) and only from modules that are on and they may see. Each module keeps its own table; a new module
// with dates adds a loader here. Rules: times as timestamptz (Berlin when shown), date-only things are all-day,
// long-term rentals show their key dates (start, last day to give notice, end), not a year-long bar; projects longer than
// two weeks show their start and end.
import { DOT } from "@/projects/fields"
import { longTerm, termInfo } from "@/rentals/fields"
import type { getContext } from "@/lib/context"
import type { T } from "@/i18n/translate"

type Ctx = Awaited<ReturnType<typeof getContext>>

export const CALENDAR_SOURCES = ["events", "shifts", "absences", "tasks", "projects", "rentals", "courses"] as const
export type CalendarSource = (typeof CALENDAR_SOURCES)[number]

export type CalendarEntry = {
  source: CalendarSource
  id: string
  title: string
  starts_at: string // ISO; for all-day entries the day at 00:00
  ends_at: string | null // null = a point in time
  all_day: boolean
  color: string // a CSS colour from the theme (var(--chart-n) …)
  href: string // the record (page or drawer)
}

const ACCESS: Record<CalendarSource, { module: string; permission: string }> = {
  events: { module: "events", permission: "events.view" },
  shifts: { module: "shifts", permission: "shifts.view" },
  absences: { module: "hr", permission: "hr.view" },
  tasks: { module: "projects", permission: "projects.view" },
  projects: { module: "projects", permission: "projects.view" },
  rentals: { module: "rentals", permission: "rentals.view" },
  courses: { module: "courses", permission: "courses.view" },
}
/** Each source's colour (events may use their own type colours); the calendar's source chips show it as the legend. */
export const COLOR: Record<CalendarSource, string> = {
  events: "var(--chart-1)",
  shifts: "var(--chart-4)",
  absences: "var(--muted-foreground)",
  tasks: "var(--chart-3)",
  projects: "var(--chart-2)",
  rentals: "var(--chart-5)",
  courses: "var(--primary)",
}

/** The sources this person sees (module on + permission). */
export const sourcesFor = (ctx: Ctx) => CALENDAR_SOURCES.filter((s) => ctx.modules.has(ACCESS[s].module) && ctx.can(ACCESS[s].permission))

const day = (v: string) => `${v}T00:00:00`
const berlinDay = (v: string) => new Date(v).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })

type RentalTerm = { starts_at: string; ends_at: string | null; renew_months: number | null; notice_months: number | null; notice_at: string | null }
/** A long-term contract's key dates as [day, kind]: start, the last day to give notice (renewing), the end (fixed). */
export function rentalMarks(r: RentalTerm): [string, "start" | "deadline" | "end"][] {
  const marks: [string, "start" | "deadline" | "end"][] = [[berlinDay(r.starts_at), "start"]]
  const term = termInfo({ end: r.ends_at ? berlinDay(r.ends_at) : null, renew_months: r.renew_months, notice_months: r.notice_months, noticeGiven: !!r.notice_at }, berlinDay(new Date().toISOString()))
  if (term.kind === "renew") marks.push([term.deadline, "deadline"])
  if (term.kind === "fixed") marks.push([term.end, "end"])
  return marks
}

/** Everything dated between `from` and `to` (ISO) from the given sources. */
export async function calendarEntries(ctx: Ctx, t: T, from: string, to: string, only: CalendarSource[]): Promise<CalendarEntry[]> {
  const org = ctx.org.id
  const fromDay = from.slice(0, 10)
  const toDay = to.slice(0, 10)
  const load: Record<CalendarSource, () => Promise<CalendarEntry[]>> = {
    events: async () => {
      // Coloured by the first select field of events that has option colours (e.g. "Typ").
      const { data: fields } = await ctx.supabase.from("custom_fields").select("key, option_colors").eq("org_id", org).eq("entity", "events").eq("type", "select").order("position")
      const typed = (fields ?? []).find((f) => Object.keys((f.option_colors as object) ?? {}).length)
      const colorOf = (custom: unknown) => {
        const v = typed && (custom as Record<string, unknown> | null)?.[typed.key]
        return (typeof v === "string" && DOT[(typed!.option_colors as Record<string, string>)[v]]) || COLOR.events
      }
      const { data } = await ctx.supabase.from("events").select("id, title, starts_at, ends_at, status, custom, event_types(color)").eq("org_id", org).is("deleted_at", null).lt("starts_at", to).or(`ends_at.gte.${from},and(ends_at.is.null,starts_at.gte.${from})`).limit(1000)
      return (data ?? []).map((e) => ({ source: "events", id: e.id, title: e.status === "cancelled" ? `✕ ${e.title}` : e.title, starts_at: e.starts_at, ends_at: e.ends_at, all_day: false, color: (e.event_types?.color && DOT[e.event_types.color]) || colorOf(e.custom), href: `/events/${e.id}` }))
    },
    shifts: async () => {
      const { data } = await ctx.supabase.from("shifts").select("id, title, starts_at, ends_at, positions(name)").eq("org_id", org).lt("starts_at", to).gte("ends_at", from).limit(2000)
      return (data ?? []).map((s) => ({ source: "shifts", id: s.id, title: s.title || s.positions?.name || "", starts_at: s.starts_at, ends_at: s.ends_at, all_day: false, color: COLOR.shifts, href: `/shifts?edit=${s.id}` }))
    },
    absences: async () => {
      const { data } = await ctx.supabase.from("absences").select("id, kind, starts_on, ends_on, employees!inner(name, deleted_at)").eq("org_id", org).is("employees.deleted_at", null).lte("starts_on", toDay).gte("ends_on", fromDay).limit(2000)
      return (data ?? []).map((a) => ({ source: "absences", id: a.id, title: `${a.employees.name} · ${t.dynamic(`hr.kinds.${a.kind}`)}`, starts_at: day(a.starts_on), ends_at: day(a.ends_on), all_day: true, color: COLOR.absences, href: `/hr/absences?edit=${a.id}` }))
    },
    tasks: async () => {
      const { data } = await ctx.supabase.from("tasks").select("id, title, start_on, due_on, completed_at").eq("org_id", org).is("deleted_at", null).not("due_on", "is", null).lte("due_on", toDay).gte("due_on", fromDay).limit(2000)
      return (data ?? []).map((x) => ({ source: "tasks", id: x.id, title: x.completed_at ? `✓ ${x.title}` : x.title, starts_at: day(x.start_on && x.start_on <= x.due_on! ? x.start_on : x.due_on!), ends_at: day(x.due_on!), all_day: true, color: COLOR.tasks, href: `/projects/tasks?task=${x.id}` }))
    },
    projects: async () => {
      const { data } = await ctx.supabase.from("projects").select("id, name, color, start_on, end_on").eq("org_id", org).is("deleted_at", null).or(`start_on.not.is.null,end_on.not.is.null`).limit(500)
      return (data ?? [])
        .filter((p) => (p.start_on ?? p.end_on!) <= toDay && (p.end_on ?? p.start_on!) >= fromDay)
        .flatMap((p): CalendarEntry[] => {
          const a = p.start_on ?? p.end_on!
          const b = p.end_on ?? p.start_on!
          const entry = { source: "projects" as const, all_day: true, ends_at: null, color: DOT[p.color] ?? COLOR.projects, href: `/projects/${p.id}` }
          // Up to two weeks: one bar. Longer projects (months) only mark their start and end, like long-term rentals.
          if (Date.parse(b) - Date.parse(a) <= 14 * 86_400_000) return [{ ...entry, id: p.id, title: p.name, starts_at: day(a), ends_at: day(b) }]
          return [[a, "start"], [b, "end"]]
            .filter(([d]) => d >= fromDay && d <= toDay)
            .map(([d, kind]) => ({ ...entry, id: `${p.id}-${kind}`, title: `${p.name} · ${t.dynamic(`calendar.projectMarks.${kind}`)}`, starts_at: day(d) }))
        })
    },
    rentals: async () => {
      const { data } = await ctx.supabase.from("rentals").select("id, status, unit, starts_at, ends_at, renew_months, notice_months, notice_at, rental_objects(name)").eq("org_id", org).is("deleted_at", null).neq("status", "cancelled").lt("starts_at", to).limit(2000)
      const out: CalendarEntry[] = []
      for (const r of data ?? []) {
        const name = r.rental_objects?.name ?? ""
        const href = `/rentals/r/${r.id}`
        if (!longTerm(r.unit)) {
          // Short bookings (hours, days, a week): a normal entry.
          if (!r.ends_at || r.ends_at >= from) out.push({ source: "rentals", id: r.id, title: name, starts_at: r.starts_at, ends_at: r.ends_at, all_day: false, color: COLOR.rentals, href })
          continue
        }
        // Long-term contracts: only their key dates, as all-day markers.
        for (const [d, kind] of rentalMarks(r))
          if (d >= fromDay && d <= toDay) out.push({ source: "rentals", id: `${r.id}-${kind}`, title: `${name} · ${t.dynamic(`calendar.rentalMarks.${kind}`)}`, starts_at: day(d), ends_at: null, all_day: true, color: COLOR.rentals, href })
      }
      return out
    },
    courses: async () => {
      const { data } = await ctx.supabase.from("course_sessions").select("id, course_id, starts_at, ends_at, courses!inner(title, deleted_at, track_attendance)").eq("org_id", org).is("courses.deleted_at", null).lt("starts_at", to).gte("starts_at", from).limit(2000)
      // A date opens its attendance page, or its sheet on the course when attendance isn't taken.
      return (data ?? []).map((c) => ({ source: "courses", id: c.id, title: c.courses.title, starts_at: c.starts_at, ends_at: c.ends_at, all_day: false, color: COLOR.courses, href: c.courses.track_attendance ? `/courses/${c.course_id}/sessions/${c.id}` : `/courses/${c.course_id}?edit=${c.id}` }))
    },
  }
  const lists = await Promise.all(only.map((s) => load[s]().catch((e) => (console.error("calendar", s, e), [] as CalendarEntry[]))))
  return lists.flat()
}
