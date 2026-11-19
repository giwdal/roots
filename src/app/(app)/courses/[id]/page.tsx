import Link from "next/link"
import { notFound } from "next/navigation"
import { ClipboardCheckIcon, FolderKanbanIcon, RepeatIcon, Trash2Icon, UserPlusIcon } from "lucide-react"
import { contactName } from "@/app/(app)/contacts/fields"
import { ActionsMenu, MenuExport, MenuSeparator, MenuSubmit } from "@/components/actions-menu"
import { Choice } from "@/components/choice"
import { ContactPicker } from "@/components/contact-picker"
import { DateInput } from "@/components/date-input"
import { DetailList } from "@/components/detail-list"
import { FileList } from "@/components/file-list"
import { InlineField } from "@/components/inline-field"
import { LinkRows, type LinkRow } from "@/components/link-rows"
import { Notice } from "@/components/notice"
import { Page, PageHeader } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { AddLink, Section } from "@/components/section"
import { Stat, Stats } from "@/components/stats"
import { SubmitButton } from "@/components/submit-button"
import { TimeInput } from "@/components/time-input"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { attendanceRate } from "@/courses/fields"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { addParticipant, addSessions, patchCourse, restoreCourse, setParticipantStatus, trashCourse } from "../actions"
import { SessionSheet } from "../session-sheet"

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]
const UUID = /^[0-9a-f-]{36}$/

// One course (patterns.md §8): identity (title, full / waiting), Stats (places, waiting list, next date, attendance),
// main = the dates (next first, earlier collapsed; a date opens its attendance page, or ?edit=<id> without attendance)
// and the participants (Abmelden asks: the waiting list moves up); right rail = Eigenschaften edited in place
// (patchCourse), Verknüpft, Dateien. The next step is the primary: today's attendance, the first dates, a person.
export default async function CoursePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params
  if (!UUID.test(id)) notFound()
  const ctx = await requirePerm("courses.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("courses.manage")
  const seesProjects = ctx.modules.has("projects") && ctx.can("projects.view")
  const [{ data: c }, { data: sessions }, { data: people }, { data: marks }, { data: locations }, { data: projects }] = await Promise.all([
    ctx.supabase.from("courses").select("*").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("course_sessions").select("id, course_id, starts_at, ends_at, cancelled, note").eq("course_id", id).eq("org_id", ctx.org.id).order("starts_at"),
    ctx.supabase
      .from("course_participants")
      .select("id, status, note, created_at, contacts(id, first_name, last_name, company, email)")
      .eq("course_id", id)
      .eq("org_id", ctx.org.id)
      .order("created_at"),
    ctx.supabase.from("course_attendance").select("session_id, participant_id, present, course_sessions!inner(course_id)").eq("org_id", ctx.org.id).eq("course_sessions.course_id", id),
    ctx.supabase.from("locations").select("id, name").eq("org_id", ctx.org.id).order("name"),
    seesProjects ? ctx.supabase.from("project_links").select("projects(id, name)").eq("org_id", ctx.org.id).eq("entity", "courses").eq("entity_id", id) : Promise.resolve({ data: [] }),
  ])
  if (!c) notFound()
  const now = new Date().toISOString()
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  const dayOf = (v: string) => new Date(v).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  const all = sessions ?? []
  const held = all.filter((s) => !s.cancelled && s.starts_at <= now)
  const heldIds = new Set(held.map((s) => s.id))
  const rate = (pid: string) => attendanceRate((marks ?? []).filter((m) => m.participant_id === pid && m.present && heldIds.has(m.session_id)).length, held.length)
  const enrolled = (people ?? []).filter((p) => p.status === "enrolled")
  const waiting = (people ?? []).filter((p) => p.status === "waiting")
  const cancelled = (people ?? []).filter((p) => p.status === "cancelled")
  const upcoming = all.filter((s) => s.ends_at >= now || dayOf(s.starts_at) === today)
  const earlier = all.filter((s) => !upcoming.includes(s)).reverse()
  const next = upcoming.find((s) => !s.cancelled)
  const todays = c.track_attendance ? all.find((s) => !s.cancelled && dayOf(s.starts_at) === today) : undefined
  const rates = enrolled.map((p) => rate(p.id)).filter((r): r is number => r != null)
  const average = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null
  const full = c.capacity != null && enrolled.length >= c.capacity
  const when = (s: { starts_at: string; ends_at: string }) => `${t.date(s.starts_at, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}–${t.date(s.ends_at, { hour: "2-digit", minute: "2-digit" })}`
  const sessionHref = (sid: string) => (c.track_attendance ? `/courses/${id}/sessions/${sid}` : withParams(sp, { edit: sid, new: undefined }))
  const newParam = param(sp, "new")
  const editParam = param(sp, "edit")
  const editing = editParam && UUID.test(editParam) ? all.find((s) => s.id === editParam) : undefined
  const sheetOpen = !!editing || ["series", "date", "person"].includes(newParam ?? "")
  const location = (locations ?? []).find((l) => l.id === c.location_id)

  const statusButton = (pid: string, status: "enrolled" | "cancelled", label: string) => (
    <form action={setParticipantStatus}>
      <input type="hidden" name="id" value={pid} />
      <input type="hidden" name="course_id" value={id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton size="sm" variant={status === "cancelled" ? "ghost" : "outline"} className={status === "cancelled" ? "text-muted-foreground" : undefined} data-confirm={status === "cancelled" ? "courses.confirmRemove" : undefined}>
        {label}
      </SubmitButton>
    </form>
  )
  const person = (p: (typeof enrolled)[number]) => (
    <span className="grid min-w-0 flex-1">
      {p.contacts ? (
        <Link href={`/contacts/${p.contacts.id}`} className="truncate font-medium hover:underline">
          {contactName(p.contacts)}
        </Link>
      ) : (
        "–"
      )}
      {p.note && <span className="truncate text-xs text-muted-foreground">{p.note}</span>}
    </span>
  )
  const sessionRow = (s: (typeof all)[number]) => {
    const present = (marks ?? []).filter((m) => m.session_id === s.id && m.present).length
    const marked = (marks ?? []).some((m) => m.session_id === s.id)
    return (
      <li key={s.id}>
        <Link href={sessionHref(s.id)} scroll={false} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm hover:bg-muted active:bg-muted">
          <span className="grid min-w-0 flex-1">
            <span className={s.cancelled ? "text-muted-foreground line-through" : "font-medium"}>{when(s)}</span>
            {s.note && <span className="truncate text-xs text-muted-foreground">{s.note}</span>}
          </span>
          {s.cancelled ? (
            <Badge variant="secondary">{t("courses.cancelledDate")}</Badge>
          ) : dayOf(s.starts_at) === today ? (
            <Badge variant="info">{t("courses.today")}</Badge>
          ) : (
            c.track_attendance && marked && <span className="text-xs text-muted-foreground tabular-nums">{t("courses.presentOf", { present, total: enrolled.length })}</span>
          )}
        </Link>
      </li>
    )
  }

  // Eigenschaften: single values edited in place (courses.manage), checked by patchCourse like the form.
  const prop = (field: string, label: string, value: string | null, opts: { kind?: React.ComponentProps<typeof InlineField>["kind"]; display?: React.ReactNode; options?: { value: string; label: string }[] } = {}) => ({
    label,
    value: canManage ? <InlineField action={patchCourse} id={c.id} field={field} value={value} label={label} {...opts} /> : (opts.display ?? value),
  })
  const properties = (
    <Section id="properties" title={t("courses.properties")}>
      <DetailList
        phoneLimit={4}
        items={[
          prop("title", t("courses.titleLabel"), c.title),
          prop("instructor", t("courses.instructor"), c.instructor),
          prop("capacity", t("courses.capacity"), c.capacity != null ? String(c.capacity) : null, { kind: "number", display: c.capacity != null ? String(c.capacity) : undefined }),
          (locations ?? []).length > 0 && prop("location_id", t("courses.location"), c.location_id, { kind: "choice", options: (locations ?? []).map((l) => ({ value: l.id, label: l.name })), display: location?.name }),
          prop("track_attendance", t("courses.trackAttendance"), String(c.track_attendance), {
            kind: "choice",
            options: [
              { value: "true", label: t("common.yes") },
              { value: "false", label: t("common.no") },
            ],
            display: c.track_attendance ? t("common.yes") : t("common.no"),
          }),
          prop("description", t("courses.description"), c.description, { kind: "textarea", display: c.description && <span className="whitespace-pre-line">{c.description}</span> }),
        ]}
      />
    </Section>
  )
  const linked: LinkRow[] = (projects ?? []).flatMap((l) => (l.projects ? [{ key: l.projects.id, icon: FolderKanbanIcon, href: `/projects/${l.projects.id}`, title: l.projects.name, detail: t("projects.project") }] : []))

  // The next step: today's attendance; a course without dates gets its dates; else someone joins.
  const primary =
    !canManage || c.deleted_at
      ? undefined
      : todays
        ? { href: `/courses/${id}/sessions/${todays.id}`, label: t("courses.takeAttendance"), icon: ClipboardCheckIcon }
        : !all.length
          ? { href: withParams(sp, { new: "series", edit: undefined }), label: t("courses.addSeries"), icon: RepeatIcon }
          : { href: withParams(sp, { new: "person", edit: undefined }), label: t("courses.addPerson"), icon: UserPlusIcon }

  return (
    <Page size="record">
      <PageHeader
        crumbs={[{ href: "/courses", label: t("courses.title") }, { label: c.title }]}
        title={c.title}
        badge={c.deleted_at ? <Badge variant="destructive">{t("courses.trash")}</Badge> : full ? <Badge variant="warning">{t("courses.full")}</Badge> : undefined}
        meta={[c.instructor, location?.name].filter(Boolean).join(" · ") || undefined}
        menu={
          !c.deleted_at && (
            <ActionsMenu>
              <MenuExport entity="course-participants" query={{ course: id }} label={t("courses.participants")} />
              {canManage && (
                <>
                  <MenuSeparator />
                  <MenuSubmit form="trash-course" icon={<Trash2Icon />} destructive>
                    {t("courses.toTrash")}
                  </MenuSubmit>
                </>
              )}
            </ActionsMenu>
          )
        }
        primary={primary}
      />
      {canManage && !c.deleted_at && (
        <form id="trash-course" action={trashCourse} hidden>
          <input type="hidden" name="id" value={c.id} />
        </form>
      )}
      <Notice error={!sheetOpen ? param(sp, "error") : undefined} ok={param(sp, "ok")} />

      {c.deleted_at ? (
        <div className="grid max-w-xl gap-3">
          <p className="rounded-lg border bg-muted px-3 py-2 text-sm">{t("courses.inTrash")}</p>
          {canManage && (
            <form action={restoreCourse}>
              <input type="hidden" name="id" value={c.id} />
              <SubmitButton>{t("courses.restore")}</SubmitButton>
            </form>
          )}
        </div>
      ) : (
        <>
          <Stats>
            <Stat label={t("courses.places")} value={c.capacity ? `${enrolled.length} / ${c.capacity}` : enrolled.length} hint={c.capacity ? undefined : t("courses.unlimited")} href="#participants" tone={full ? "warn" : undefined} />
            <Stat label={t("courses.waitingList")} value={waiting.length} href={waiting.length ? "#waiting" : undefined} />
            <Stat label={t("courses.nextDate")} value={next ? t.date(next.starts_at, { day: "2-digit", month: "2-digit" }) : "–"} hint={next ? t.date(next.starts_at, { weekday: "short", hour: "2-digit", minute: "2-digit" }) : undefined} href={next ? sessionHref(next.id) : undefined} />
            {c.track_attendance && <Stat label={t("courses.attendanceStat")} value={average != null ? `${average} %` : "–"} hint={held.length ? t("courses.heldCount", { count: held.length }) : undefined} />}
          </Stats>

          {/* patterns.md §8: desktop = main column + right rail; tablets and phones = Eigenschaften → main → Verknüpft → Dateien. */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
            <aside className="grid min-w-0 content-start gap-6 lg:col-start-2 lg:row-start-1">{properties}</aside>
            <div className="grid min-w-0 content-start gap-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
              <Section id="dates" title={t("courses.dates")}>
                {upcoming.length ? <ul className="grid divide-y rounded-lg border">{upcoming.map(sessionRow)}</ul> : <p className="text-sm text-muted-foreground">{all.length ? t("courses.noUpcoming") : t("courses.noDates")}</p>}
                {earlier.length > 0 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground">{t("courses.earlierCount", { count: earlier.length })}</summary>
                    <ul className="mt-2 grid divide-y rounded-lg border">{earlier.map(sessionRow)}</ul>
                  </details>
                )}
                {canManage && (
                  <div className="flex flex-wrap gap-x-4">
                    <AddLink href={withParams(sp, { new: "series", edit: undefined })}>{t("courses.addSeries")}</AddLink>
                    <AddLink href={withParams(sp, { new: "date", edit: undefined })}>{t("courses.addOne")}</AddLink>
                  </div>
                )}
              </Section>

              <Section id="participants" title={t("courses.participants")}>
                {enrolled.length ? (
                  <ul className="grid divide-y rounded-lg border">
                    {enrolled.map((p) => (
                      <li key={p.id} className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm">
                        {person(p)}
                        {c.track_attendance && rate(p.id) != null && <span className="text-xs text-muted-foreground tabular-nums">{t("courses.rate", { rate: rate(p.id)! })}</span>}
                        {canManage && statusButton(p.id, "cancelled", t("courses.remove"))}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("courses.noParticipants")}</p>
                )}
                {canManage && <AddLink href={withParams(sp, { new: "person", edit: undefined })}>{t("courses.addPerson")}</AddLink>}
              </Section>

              {waiting.length > 0 && (
                <Section id="waiting" title={t("courses.waitingList")} description={t("courses.waitingHint")}>
                  <ol className="grid divide-y rounded-lg border">
                    {waiting.map((p, i) => (
                      <li key={p.id} className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm">
                        <span className="w-5 text-right tabular-nums text-muted-foreground">{i + 1}.</span>
                        {person(p)}
                        {canManage && statusButton(p.id, "cancelled", t("courses.remove"))}
                      </li>
                    ))}
                  </ol>
                </Section>
              )}

              {cancelled.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">{t("courses.cancelledCount", { count: cancelled.length })}</summary>
                  <ul className="mt-2 grid divide-y rounded-lg border">
                    {cancelled.map((p) => (
                      <li key={p.id} className="flex min-h-11 items-center gap-3 px-3 py-2">
                        {person(p)}
                        {canManage && statusButton(p.id, "enrolled", t("courses.reEnrol"))}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
            <aside className="grid min-w-0 content-start gap-6 lg:col-start-2 lg:row-start-2">
              {linked.length > 0 && (
                <Section id="linked" title={t("courses.linked")}>
                  <LinkRows rows={linked} />
                </Section>
              )}
              <FileList ctx={ctx} entity="courses" entityId={id} back={`/courses/${id}`} />
            </aside>
          </div>

          {canManage && newParam === "person" && (
            <UrlSheet params={["new"]} title={t("courses.addPerson")} meta={c.title} compact>
              <Notice error={param(sp, "error")} />
              <form action={addParticipant} className="grid gap-4">
                <input type="hidden" name="course_id" value={id} />
                <ContactPicker name="contact_id" label={t("courses.person")} placeholder={t("courses.searchContact")} />
                <div className="grid gap-2">
                  <Label htmlFor="p-note">{t("courses.noteOptional")}</Label>
                  <Input id="p-note" name="note" maxLength={500} />
                </div>
                {full && <p className="text-xs text-muted-foreground">{t("courses.fullHint")}</p>}
                <SaveBar label={t("courses.add")} always />
              </form>
            </UrlSheet>
          )}
          {canManage && newParam === "series" && (
            <UrlSheet params={["new"]} title={t("courses.addSeries")} meta={c.title}>
              <Notice error={param(sp, "error")} />
              <form action={addSessions} className="grid gap-4">
                <input type="hidden" name="course_id" value={id} />
                <input type="hidden" name="mode" value="series" />
                <fieldset className="grid gap-2">
                  <legend className="mb-2 text-sm font-medium">{t("courses.weekdays")}</legend>
                  {/* Seven toggles in one row: a tap ticks a day. */}
                  <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1">
                    {WEEKDAYS.map((d) => (
                      <label key={d} className="inline-flex min-h-[calc(var(--control)-0.5rem)] min-w-10 cursor-pointer touch-manipulation items-center justify-center rounded-md px-2 text-sm text-muted-foreground has-checked:bg-background has-checked:font-medium has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-2 has-focus-visible:ring-ring">
                        <input type="checkbox" name="weekdays" value={d} className="sr-only" />
                        {t.date(`2026-10-${11 + d}T12:00:00Z`, { weekday: "short" })}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="grid gap-2">
                  <span className="text-sm font-medium">{t("courses.timeOfDay")}</span>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <TimeInput name="start_time" defaultValue="18:00" required aria-label={t("courses.startTime")} />
                    <span>–</span>
                    <TimeInput name="end_time" defaultValue="19:30" required aria-label={t("courses.endTime")} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="s-every">{t("courses.rhythm")}</Label>
                  <Choice id="s-every" name="every_weeks" label={t("courses.rhythm")} required defaultValue="1" options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: n === 1 ? t("courses.weekly") : t("courses.everyN", { count: n }) }))} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid content-start gap-2">
                    <Label htmlFor="s-from">{t("courses.from")}</Label>
                    <DateInput id="s-from" name="from" type="date" required defaultValue={today} />
                  </div>
                  <div className="grid content-start gap-2">
                    <Label htmlFor="s-to">{t("courses.to")}</Label>
                    <DateInput id="s-to" name="to" type="date" required />
                  </div>
                </div>
                <SaveBar label={t("courses.createDates")} always />
              </form>
            </UrlSheet>
          )}
          {canManage && newParam === "date" && (
            <UrlSheet params={["new"]} title={t("courses.addOne")} meta={c.title} compact>
              <Notice error={param(sp, "error")} />
              <form action={addSessions} className="grid gap-4">
                <input type="hidden" name="course_id" value={id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid content-start gap-2">
                    <Label htmlFor="o-start">{t("courses.start")}</Label>
                    <DateInput id="o-start" name="starts_at" type="datetime-local" required />
                  </div>
                  <div className="grid content-start gap-2">
                    <Label htmlFor="o-end">{t("courses.end")}</Label>
                    <DateInput id="o-end" name="ends_at" type="datetime-local" required />
                  </div>
                </div>
                <SaveBar label={t("courses.createDate")} always />
              </form>
            </UrlSheet>
          )}
          {editing && <SessionSheet t={t} s={editing} from="course" param="edit" error={param(sp, "error")} canManage={canManage} />}
        </>
      )}
    </Page>
  )
}

export const instant = false
