import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { Trash2Icon, XIcon } from "lucide-react"
import { ActionsMenu, MenuSubmit } from "@/components/actions-menu"
import { CalendarView, type CalendarItem } from "@/components/calendar-view"
import { Choice } from "@/components/choice"
import { ListToolbar } from "@/components/data-table"
import { DateInput } from "@/components/date-input"
import { DetailList } from "@/components/detail-list"
import { FilterMenu } from "@/components/filter-menu"
import { Notice } from "@/components/notice"
import { Page, PageHeader } from "@/components/page"
import { RecordPicker } from "@/components/record-picker"
import { SaveBar } from "@/components/save-bar"
import { SubmitButton } from "@/components/submit-button"
import { TypedInput } from "@/components/typed-input"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { getContext } from "@/lib/context"
import { fromLocalInput, toLocalInput } from "@/lib/time"
import { param, withParams } from "@/lib/url"
import { assign, deleteShift, moveShift, saveShift, searchShiftEvents, searchStaff } from "./actions"
import { PlanViews } from "./views"

const day = (d: string) => new Date(`${d}T12:00:00Z`)
const iso = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: string, n: number) => iso(new Date(day(d).getTime() + n * 86_400_000))
const monday = (d: string) => addDays(d, -((day(d).getUTCDay() + 6) % 7))
const berlinDay = (ts: string) => new Date(ts).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })

// Schichten › Plan: the week's shifts (calendar), coloured by coverage. A shift opens a sheet that starts with who is
// on it (assign, accept, clock in/out for someone: immediate) and then its fields (SaveBar). ?edit=<id> / ?new=shift.
export default async function ShiftPlan({ searchParams }: PageProps<"/shifts">) {
  const ctx = await getContext()
  if (!ctx.modules.has("shifts")) notFound()
  if (!ctx.can("shifts.view")) {
    if (ctx.can("shifts.self")) redirect("/shifts/me")
    notFound()
  }
  const sp = await searchParams
  const old = param(sp, "shift") // the sheet's old param (notifications, bookmarks)
  if (old) redirect(`/shifts${withParams(sp, { shift: undefined, edit: old })}`)
  const t = await getT()
  const canManage = ctx.can("shifts.manage")
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  const dateParam = param(sp, "date")
  const focus = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today
  const week = monday(focus)
  const eventId = param(sp, "event")
  const locationId = param(sp, "location")

  let q = ctx.supabase
    .from("shifts")
    .select("*, positions(name, color), locations(name), events(title), shift_assignments(staff_id, status, staff(name, color)), time_entries(staff_id, started_at, ended_at)")
    .eq("org_id", ctx.org.id)
    .order("starts_at")
  q = eventId
    ? q.eq("event_id", eventId)
    : q.gte("starts_at", fromLocalInput(`${addDays(focus, -42)}T00:00`)!.toISOString()).lt("starts_at", fromLocalInput(`${addDays(focus, 49)}T00:00`)!.toISOString())
  if (locationId) q = q.eq("location_id", locationId)
  const [{ data: shifts }, { data: staff }, { data: positions }, { data: locations }, { data: events }, { data: picked }] = await Promise.all([
    q,
    ctx.supabase.from("staff").select("id, name").eq("org_id", ctx.org.id).eq("active", true).order("name"),
    ctx.supabase.from("positions").select("id, name").eq("org_id", ctx.org.id).order("position").order("name"),
    ctx.supabase.from("locations").select("id, name").eq("org_id", ctx.org.id).order("name"),
    // The event filter offers recent and coming events; the shift form searches all of them.
    ctx.supabase.from("events").select("id, title, starts_at").eq("org_id", ctx.org.id).is("deleted_at", null).gte("starts_at", new Date(new Date().getTime() - 30 * 86_400_000).toISOString()).order("starts_at").limit(100),
    eventId ? ctx.supabase.from("events").select("id, title, starts_at").eq("id", eventId).eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  // Check-in/out of a shift = its time entry per person.
  const list = (shifts ?? []).map((s) => ({
    ...s,
    shift_assignments: s.shift_assignments.map((a) => {
      const e = s.time_entries.find((x) => x.staff_id === a.staff_id)
      return { ...a, checked_in_at: e?.started_at ?? null, checked_out_at: e?.ended_at ?? null }
    }),
  }))
  const assigned = (s: (typeof list)[number]) => s.shift_assignments.filter((a) => a.status === "assigned")
  // Coverage of the focused week (or the whole event), and applications waiting in it.
  const inWeek = eventId ? list : list.filter((s) => berlinDay(s.starts_at) >= week && berlinDay(s.starts_at) < addDays(week, 7))
  const needed = inWeek.reduce((n, s) => n + s.needed, 0)
  const filled = inWeek.reduce((n, s) => n + Math.min(assigned(s).length, s.needed), 0)
  const applied = inWeek.reduce((n, s) => n + s.shift_assignments.filter((a) => a.status === "applied").length, 0)
  const color = (s: (typeof list)[number]) => (assigned(s).length >= s.needed ? "var(--chart-1)" : assigned(s).length > 0 ? "var(--chart-4)" : "var(--destructive)")
  const label = (s: (typeof list)[number]) => s.positions?.name ?? s.title ?? ""
  const open = (id: string) => withParams(sp, { edit: id, new: undefined })
  const calEvents: CalendarItem[] = list.map((s) => ({
    id: s.id,
    title: `${label(s)} · ${assigned(s).length}/${s.needed}${assigned(s).length ? ` · ${assigned(s).map((a) => a.staff?.name).join(", ")}` : ""}`,
    start: s.starts_at,
    end: s.ends_at,
    color: color(s),
    href: open(s.id),
  }))
  const resourceEvents: CalendarItem[] = list.flatMap((s) =>
    assigned(s).map((a) => ({ id: `${s.id}:${a.staff_id}`, title: label(s), start: s.starts_at, end: s.ends_at, resourceId: a.staff_id, href: open(s.id), readOnly: true })),
  )
  const editing = list.find((s) => s.id === param(sp, "edit"))
  const creating = canManage && param(sp, "new") === "shift"
  const event = picked ?? null
  const returnTo = `/shifts?${new URLSearchParams(Object.entries({ view: param(sp, "view") ?? "", date: dateParam ?? "", event: eventId ?? "", location: locationId ?? "" }).filter(([, v]) => v))}`
  const time = (v: string) => t.date(v, { hour: "2-digit", minute: "2-digit" })
  const when = (s: { starts_at: string; ends_at: string }) => `${t.date(s.starts_at, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}–${time(s.ends_at)}`

  return (
    <Page>
      <PageHeader
        area="shifts"
        title={event ? `${t("shifts.title")} · ${event.title}` : t("shifts.title")}
        meta={
          <>
            {event ? t("shifts.coverageEvent", { event: event.title, filled, needed }) : t("shifts.coverageWeek", { date: t.date(`${week}T12:00:00Z`, { day: "numeric", month: "short" }), filled, needed })}
            {applied > 0 && <Badge variant="warning">{t("shifts.applicants", { count: applied })}</Badge>}
          </>
        }
        settings={canManage && { href: "/shifts/settings", label: t("common.settings") }}
        primary={canManage ? { href: withParams(sp, { new: "shift", edit: undefined }), label: t("shifts.newShift") } : undefined}
      />
      <Notice error={!editing && !creating ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
      <ListToolbar>
        {event ? (
          <Button render={<Link href={`/shifts${withParams(sp, { event: undefined, edit: undefined, new: undefined })}`} aria-label={`${event.title} – ${t("common.clear")}`} />} nativeButton={false} size="sm" variant="secondary">
            {event.title} <XIcon />
          </Button>
        ) : (
          !!events?.length && <FilterMenu param="event" label={t("shifts.event")} allLabel={t("shifts.allEvents")} options={events.map((e) => ({ value: e.id, label: `${e.title} · ${t.date(e.starts_at, { dateStyle: "short" })}` }))} />
        )}
        {(locations?.length ?? 0) > 0 && <FilterMenu param="location" label={t("shifts.location")} allLabel={t("shifts.allLocations")} options={(locations ?? []).map((l) => ({ value: l.id, label: l.name }))} />}
        {ctx.can("shifts.self") && <PlanViews t={t} current="plan" />}
      </ListToolbar>

      <CalendarView
        events={calEvents}
        resourceEvents={resourceEvents}
        resources={(staff ?? []).map((p) => ({ id: p.id, title: p.name }))}
        views={["week", "day", "month", "agenda", "resource"]}
        defaultView={eventId ? "agenda" : "week"}
        newHref={canManage ? withParams(sp, { new: "shift", edit: undefined }) : undefined}
        onMove={canManage ? moveShift : undefined}
      />

      {(creating || editing) && (
        <UrlSheet
          params={["new", "edit"]}
          title={editing ? label(editing) : t("shifts.newShift")}
          meta={editing && [when(editing), editing.events?.title, editing.locations?.name].filter(Boolean).join(" · ")}
          menu={
            editing &&
            canManage && (
              <ActionsMenu>
                <MenuSubmit form="delete-shift" icon={<Trash2Icon />} destructive confirm="shifts.confirmDeleteShift">
                  {t("shifts.deleteShift")}
                </MenuSubmit>
              </ActionsMenu>
            )
          }
        >
          <Notice error={param(sp, "error")} />
          {editing && <Assignments t={t} shift={editing} canManage={canManage} returnTo={returnTo} />}
          {canManage ? (
            <section className="grid gap-3" aria-labelledby="shift-fields">
              {editing && (
                <h3 id="shift-fields" className="text-sm font-medium">
                  {t("shifts.details")}
                </h3>
              )}
              <ShiftForm
                t={t}
                shift={editing}
                returnTo={returnTo}
                positions={positions ?? []}
                locations={locations ?? []}
                defaults={{
                  event: event && !editing ? { id: event.id, label: event.title, detail: t.date(event.starts_at, { dateStyle: "medium" }) } : null,
                  location: locationId ?? null,
                  start: param(sp, "start") ? toLocalInput(param(sp, "start")!) : `${focus}T18:00`,
                  end: param(sp, "end") ? toLocalInput(param(sp, "end")!) : undefined,
                  // Created in a person's column (per-person view): that person gets assigned.
                  assign: !editing ? ((staff ?? []).find((p) => p.id === param(sp, "resource")) ?? null) : null,
                }}
              />
            </section>
          ) : (
            editing && (
              <DetailList
                items={[
                  { label: t("shifts.needed"), value: editing.needed },
                  !!editing.events && { label: t("shifts.event"), value: editing.events.title },
                  !!editing.locations && { label: t("shifts.location"), value: editing.locations.name },
                  !!editing.notes && { label: t("shifts.notes"), value: editing.notes },
                ]}
              />
            )
          )}
          {editing && canManage && (
            <form id="delete-shift" action={deleteShift} hidden>
              <input type="hidden" name="id" value={editing.id} />
              <input type="hidden" name="return" value={returnTo} />
            </form>
          )}
        </UrlSheet>
      )}
    </Page>
  )
}

type Shift = {
  id: string
  title: string | null
  position_id: string | null
  location_id: string | null
  event_id: string | null
  starts_at: string
  ends_at: string
  needed: number
  open: boolean
  notes: string | null
  events: { title: string } | null
  shift_assignments: { staff_id: string; status: string; checked_in_at: string | null; checked_out_at: string | null; staff: { name: string } | null }[]
}

function ShiftForm({
  t,
  shift,
  returnTo,
  positions,
  locations,
  defaults,
}: {
  t: T
  shift?: Shift
  returnTo: string
  positions: { id: string; name: string }[]
  locations: { id: string; name: string }[]
  defaults: { event: { id: string; label: string; detail?: string } | null; location: string | null; start: string; end?: string; assign?: { id: string; name: string } | null }
}) {
  return (
    <form action={saveShift} className="grid gap-4">
      {shift && <input type="hidden" name="id" value={shift.id} />}
      <input type="hidden" name="return" value={returnTo} />
      {defaults.assign && (
        <>
          <input type="hidden" name="assign" value={defaults.assign.id} />
          <p className="rounded-lg border bg-muted px-3 py-2 text-sm">{t("shifts.assignOnCreate", { name: defaults.assign.name })}</p>
        </>
      )}
      {positions.length > 0 && (
        <div className="grid gap-2">
          <Label htmlFor="sh-pos">{t("shifts.position")}</Label>
          <Choice id="sh-pos" name="position" label={t("shifts.position")} defaultValue={shift?.position_id} options={positions.map((p) => ({ value: p.id, label: p.name }))} />
        </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor="sh-title">{t("shifts.titleLabel")}</Label>
        <Input id="sh-title" name="title" defaultValue={shift?.title ?? ""} maxLength={100} placeholder={t("shifts.titlePlaceholder")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="sh-start">{t("shifts.start")}</Label>
          <DateInput id="sh-start" name="starts_at" type="datetime-local" required defaultValue={shift ? toLocalInput(shift.starts_at) : defaults.start} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="sh-end">{t("shifts.end")}</Label>
          <DateInput id="sh-end" name="ends_at" type="datetime-local" required defaultValue={shift ? toLocalInput(shift.ends_at) : defaults.end} />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="sh-needed">{t("shifts.needed")}</Label>
        <TypedInput kind="number" id="sh-needed" name="needed" min={1} max={100} step={1} defaultValue={shift?.needed ?? 1} />
      </div>
      <RecordPicker name="event" label={t("shifts.event")} search={searchShiftEvents} initial={shift ? (shift.event_id && shift.events ? { id: shift.event_id, label: shift.events.title } : null) : defaults.event} placeholder={t("shifts.noEvent")} />
      {locations.length > 0 && (
        <div className="grid gap-2">
          <Label htmlFor="sh-loc">{t("shifts.location")}</Label>
          <Choice id="sh-loc" name="location" label={t("shifts.location")} defaultValue={shift?.location_id ?? defaults.location} options={locations.map((l) => ({ value: l.id, label: l.name }))} />
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="open" value="1" defaultChecked={shift?.open ?? true} className="size-4 accent-primary" />
        {t("shifts.openLabel")}
      </label>
      <div className="grid gap-2">
        <Label htmlFor="sh-notes">{t("shifts.notes")}</Label>
        <Input id="sh-notes" name="notes" defaultValue={shift?.notes ?? ""} maxLength={2000} />
      </div>
      <SaveBar label={shift ? undefined : t("shifts.createShift")} always={!shift} />
    </form>
  )
}

// Who is on the shift. Accept, clock in/out for someone and remove happen at once (small state changes); the shift's
// own fields below save with their SaveBar.
function Assignments({ t, shift, canManage, returnTo }: { t: T; shift: Shift; canManage: boolean; returnTo: string }) {
  const act = (staffId: string, what: string, label: React.ReactNode, variant: "default" | "outline" | "ghost" = "outline", extra: Record<string, string> = {}) => (
    <form action={assign}>
      <input type="hidden" name="id" value={shift.id} />
      <input type="hidden" name="staff" value={staffId} />
      <input type="hidden" name="what" value={what} />
      <input type="hidden" name="return" value={returnTo} />
      <SubmitButton size={what === "remove" ? "icon-sm" : "sm"} variant={variant} {...extra}>
        {label}
      </SubmitButton>
    </form>
  )
  const time = (v: string) => t.date(v, { hour: "2-digit", minute: "2-digit" })
  const count = shift.shift_assignments.filter((a) => a.status === "assigned").length
  return (
    <section className="grid gap-3" aria-labelledby="assigned">
      <h3 id="assigned" className="flex items-center gap-2 text-sm font-medium">
        {t("shifts.people", { count, needed: shift.needed })}
        {count < shift.needed && <Badge variant="destructive">{t("shifts.missing", { count: shift.needed - count })}</Badge>}
      </h3>
      {shift.shift_assignments.length > 0 && (
        <ul className="grid divide-y rounded-lg border">
          {shift.shift_assignments.map((a) => (
            <li key={a.staff_id} className="flex min-h-12 flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">{a.staff?.name}</span>
              {a.status === "applied" ? (
                <Badge variant="warning">{t("shifts.applied")}</Badge>
              ) : a.checked_out_at ? (
                <Badge variant="success">{`${time(a.checked_in_at!)}–${time(a.checked_out_at)}`}</Badge>
              ) : a.checked_in_at ? (
                <Badge variant="info">{t("shifts.since", { time: time(a.checked_in_at) })}</Badge>
              ) : null}
              {canManage && (
                <span className="flex items-center gap-1">
                  {a.status === "applied" && act(a.staff_id, "assign", t("shifts.approve"), "default")}
                  {a.status === "assigned" && !a.checked_in_at && act(a.staff_id, "check_in", t("shifts.checkIn"))}
                  {a.status === "assigned" && a.checked_in_at && !a.checked_out_at && act(a.staff_id, "check_out", t("shifts.checkOut"))}
                  {act(a.staff_id, "remove", <XIcon />, "ghost", { "aria-label": t("shifts.remove"), title: t("shifts.remove"), "data-confirm": "shifts.confirmRemovePerson" })}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <form action={assign} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <input type="hidden" name="id" value={shift.id} />
          <input type="hidden" name="what" value="assign" />
          <input type="hidden" name="return" value={returnTo} />
          <RecordPicker name="staff" label={t("shifts.addPerson")} search={searchStaff.bind(null, shift.position_id ?? "")} placeholder={t("shifts.searchPerson")} required />
          <SubmitButton size="sm" variant="outline" className="max-sm:h-10">
            {t("shifts.assignButton")}
          </SubmitButton>
        </form>
      )}
    </section>
  )
}

export const instant = false
