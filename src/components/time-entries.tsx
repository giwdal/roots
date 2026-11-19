import Link from "next/link"
import { ChevronLeftIcon, ChevronRightIcon, Trash2Icon } from "lucide-react"
import { DataTable } from "@/components/data-table"
import { ActionsMenu, MenuSubmit } from "@/components/actions-menu"
import { Choice } from "@/components/choice"
import { Notice } from "@/components/notice"
import { RecordPicker } from "@/components/record-picker"
import { SaveBar } from "@/components/save-bar"
import { TypedInput } from "@/components/typed-input"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { getT } from "@/i18n/server"
import { toLocalInput, type monthOf } from "@/lib/time"
import { minutes, warnings, type Entry } from "@/shifts/time"
import { searchStaff } from "@/app/(app)/shifts/actions"
import { deleteEntry, saveEntry, searchProjects } from "@/app/(app)/shifts/time-actions"
import { DateInput } from "@/components/date-input"

// Time tracking screens: own entries (Schichten › Meine), one person's month (Stunden › Name) and a project's Zeit view.
export type TimeRow = Entry & { note: string | null; approved_at: string | null; shift_id: string | null; staff_id: string; project_id: string | null; task_id: string | null; shifts?: { title: string | null; positions: { name: string } | null } | null; projects?: { name: string } | null; tasks?: { title: string } | null }
export const TIME_COLS = "id, started_at, ended_at, break_minutes, note, approved_at, shift_id, staff_id, project_id, task_id, shifts(title, positions(name)), projects(name), tasks(title)"

export { monthOf } from "@/lib/time"

export async function MonthNav({ month, href }: { month: ReturnType<typeof monthOf>; href: (m: string) => string }) {
  const t = await getT()
  return (
    <div className="flex items-center gap-1">
      <Button render={<Link href={href(month.prev)} />} nativeButton={false} size="icon-sm" variant="outline" aria-label={t("shifts.prevMonth")}>
        <ChevronLeftIcon />
      </Button>
      <span className="min-w-36 text-center text-sm font-medium">{t.date(`${month.month}-15T12:00:00Z`, { month: "long", year: "numeric" })}</span>
      <Button render={<Link href={href(month.next)} />} nativeButton={false} size="icon-sm" variant="outline" aria-label={t("shifts.nextMonth")}>
        <ChevronRightIcon />
      </Button>
    </div>
  )
}

export const hoursText = (t: Awaited<ReturnType<typeof getT>>, min: number) => `${t.number(min / 60, { maximumFractionDigits: 2 })} h`

/** Entries with net time, break (auto/manual), approval and law warnings (`people`: several persons, adds a column). Rows open `editHref`. */
export async function TimeEntryList({ rows, editHref, people, hideProject }: { rows: TimeRow[]; editHref: (id: string) => string | null; people?: Map<string, string>; hideProject?: boolean }) {
  const t = await getT()
  // Law warnings are per person (breaks, rest between days).
  const warn = people ? new Map([...new Set(rows.map((r) => r.staff_id))].flatMap((sid) => [...warnings(rows.filter((r) => r.staff_id === sid))])) : warnings(rows)
  const time = (iso: string) => t.date(iso, { hour: "2-digit", minute: "2-digit" })
  return (
    <DataTable
      rows={rows}
      rowKey={(r) => r.id}
      rowHref={(r) => editHref(r.id) ?? undefined}
      empty={t("time.empty")}
      columns={[
        { header: t("time.day"), cell: (r) => <span className="font-medium">{t.date(r.started_at, { weekday: "short", day: "numeric", month: "short" })}</span> },
        ...(people ? [{ header: t("time.person"), cell: (r: TimeRow) => people.get(r.staff_id) ?? "–" }] : []),
        { header: t("time.span"), cell: (r) => `${time(r.started_at)}–${r.ended_at ? time(r.ended_at) : "…"}`, className: "tabular-nums" },
        {
          header: t("time.break"),
          cell: (r) => {
            const m = minutes(r)
            return `${m.break} min${m.auto ? ` (${t("time.auto")})` : ""}`
          },
          className: "tabular-nums",
          phone: false,
        },
        { header: t("time.net"), cell: (r) => (r.ended_at ? hoursText(t, minutes(r).net) : <Badge variant="info">{t("time.running")}</Badge>), className: "tabular-nums" },
        { header: t("time.what"), cell: (r) => [r.shifts?.positions?.name ?? r.shifts?.title, !hideProject && r.projects?.name, r.tasks?.title, r.note].filter(Boolean).join(" · ") || "–", phone: false },
        {
          header: t("time.status"),
          phone: false,
          cell: (r) => (
            <span className="flex flex-wrap gap-1">
              {r.approved_at ? <Badge variant="success">{t("time.approvedBadge")}</Badge> : <Badge variant="warning">{t("time.openBadge")}</Badge>}
              {(warn.get(r.id) ?? []).map((w) => (
                <Badge key={w} variant="destructive" title={t.dynamic(`time.warnings.${w}.hint`)}>
                  {t.dynamic(`time.warnings.${w}.label`)}
                </Badge>
              ))}
            </span>
          ),
        },
        // Phones: one badge, a problem first (the sheet shows all of them).
        {
          header: t("time.status"),
          cell: (r) => {
            const w = warn.get(r.id)?.[0]
            return w ? (
              <Badge variant="destructive">{t.dynamic(`time.warnings.${w}.label`)}</Badge>
            ) : r.approved_at ? (
              <Badge variant="success">{t("time.approvedBadge")}</Badge>
            ) : (
              <Badge variant="warning">{t("time.openBadge")}</Badge>
            )
          },
          table: false,
        },
      ]}
    />
  )
}

/**
 * The time entry sheet, the same on Meine, Stunden › Person and a project's Zeit view: one form + SaveBar, delete in ⋯
 * (asks first). `pickStaff`: someone with manage/approve picks the person (`staff` = the default); `staff` alone = a
 * fixed person. `pickProject`: project picker (projects module on); `projectId`: fixed project with its `tasks`.
 */
export async function TimeEntrySheet({
  params,
  entry,
  staff,
  pickStaff,
  returnTo,
  canDelete,
  pickProject,
  projectId,
  tasks,
  error,
}: {
  params: string[]
  entry?: TimeRow | null
  staff?: { id: string; name: string } | null
  pickStaff?: boolean
  returnTo: string
  canDelete: boolean
  pickProject?: boolean
  projectId?: string
  tasks?: { id: string; title: string }[]
  error?: string
}) {
  const t = await getT()
  return (
    <UrlSheet
      params={params}
      title={entry ? t("time.edit") : t("time.add")}
      meta={entry && <>{t.date(entry.started_at, { weekday: "long", day: "numeric", month: "long" })}{entry.approved_at && ` · ${t("time.approvedBadge")}`}</>}
      menu={
        entry &&
        canDelete && (
          <ActionsMenu>
            <MenuSubmit form="delete-entry" icon={<Trash2Icon />} destructive confirm="time.confirmDelete">
              {t("time.delete")}
            </MenuSubmit>
          </ActionsMenu>
        )
      }
    >
      <Notice error={error} />
      <form action={saveEntry} className="grid gap-4">
        {entry && <input type="hidden" name="id" value={entry.id} />}
        {staff && !pickStaff && <input type="hidden" name="staff" value={staff.id} />}
        <input type="hidden" name="return" value={returnTo} />
        {projectId && <input type="hidden" name="project_id" value={projectId} />}
        {pickStaff && !entry && <RecordPicker name="staff" label={t("time.person")} search={searchStaff.bind(null, "")} initial={staff ? { id: staff.id, label: staff.name } : null} required />}
        {pickProject && !projectId && (
          <RecordPicker name="project_id" label={t("time.project")} search={searchProjects} initial={entry?.project_id ? { id: entry.project_id, label: entry.projects?.name ?? "–" } : null} placeholder={t("time.noProject")} />
        )}
        {tasks && tasks.length > 0 && (
          <div className="grid gap-2">
            <Label htmlFor="te-task">{t("time.task")}</Label>
            <Choice id="te-task" name="task_id" label={t("time.task")} defaultValue={entry?.task_id} emptyLabel={t("time.noTask")} options={tasks.map((x) => ({ value: x.id, label: x.title }))} />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="te-start">{t("time.start")}</Label>
            <DateInput id="te-start" name="started_at" type="datetime-local" required defaultValue={entry ? toLocalInput(entry.started_at) : ""} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="te-end">{t("time.end")}</Label>
            <DateInput id="te-end" name="ended_at" type="datetime-local" defaultValue={entry?.ended_at ? toLocalInput(entry.ended_at) : ""} />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="te-break">{t("time.breakMinutes")}</Label>
          <TypedInput kind="number" id="te-break" name="break_minutes" min={0} max={1440} step={1} placeholder={t("time.breakAuto")} defaultValue={entry?.break_minutes ?? ""} />
          <p className="text-xs text-muted-foreground">{t("time.breakHint")}</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="te-note">{t("time.note")}</Label>
          <Textarea id="te-note" name="note" maxLength={500} rows={2} defaultValue={entry?.note ?? ""} />
        </div>
        <SaveBar label={entry ? undefined : t("time.create")} always={!entry} />
      </form>
      {entry && canDelete && (
        <form id="delete-entry" action={deleteEntry} hidden>
          <input type="hidden" name="id" value={entry.id} />
          <input type="hidden" name="return" value={returnTo} />
        </form>
      )}
    </UrlSheet>
  )
}
