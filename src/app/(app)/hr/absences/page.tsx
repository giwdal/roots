import Link from "next/link"
import { XIcon } from "lucide-react"
import { CalendarView, type CalendarItem } from "@/components/calendar-view"
import { ListToolbar } from "@/components/data-table"
import { FilterMenu } from "@/components/filter-menu"
import { Notice } from "@/components/notice"
import { Page, PageHeader } from "@/components/page"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { ABSENCE_KINDS } from "@/hr/fields"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { AbsenceSheet } from "../absence-sheet"

const COLORS: Record<string, string> = { vacation: "var(--chart-1)", sick: "var(--destructive)", unpaid: "var(--chart-4)", other: "var(--chart-3)" }
const addDays = (d: string, n: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10)
const UUID = /^[0-9a-f-]{36}$/

// Personal › Abwesenheiten: who's away when (holiday, sick, unpaid, other) as a calendar, filtered by kind or one
// person (?person=). Click a day or drag → new absence; an entry opens its sheet (read-only without hr.manage).
export default async function AbsencesPage({ searchParams }: PageProps<"/hr/absences">) {
  const ctx = await requirePerm("hr.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("hr.manage")
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  const focus = /^\d{4}-\d{2}-\d{2}$/.test(param(sp, "date") ?? "") ? param(sp, "date")! : today
  const editId = param(sp, "edit")
  const kind = ABSENCE_KINDS.find((k) => k === param(sp, "kind"))
  const personId = UUID.test(param(sp, "person") ?? "") ? param(sp, "person")! : null
  const prefillId = UUID.test(param(sp, "employee") ?? "") ? param(sp, "employee")! : null
  const creating = canManage && param(sp, "new") === "absence"
  let query = ctx.supabase
    .from("absences")
    .select("id, kind, starts_on, ends_on, half_day, note, employee_id, employees(name)")
    .eq("org_id", ctx.org.id)
    .lte("starts_on", addDays(focus, 45))
    .gte("ends_on", addDays(focus, -45))
    .order("starts_on")
  if (kind) query = query.eq("kind", kind)
  if (personId) query = query.eq("employee_id", personId)
  const [{ data: rows }, { data: editing }, { data: person }, { data: prefill }] = await Promise.all([
    query,
    editId && UUID.test(editId) ? ctx.supabase.from("absences").select("*, employees(name)").eq("id", editId).eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
    personId ? ctx.supabase.from("employees").select("id, name").eq("id", personId).eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
    creating && prefillId ? ctx.supabase.from("employees").select("id, name").eq("id", prefillId).eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const items: CalendarItem[] = (rows ?? []).map((a) => ({
    id: a.id,
    title: `${a.employees?.name ?? ""} · ${t.dynamic(`hr.kinds.${a.kind}`)}${a.half_day ? ` (${t("hr.halfDay")})` : ""}`,
    start: `${a.starts_on}T00:00:00`,
    end: `${addDays(a.ends_on, 1)}T00:00:00`,
    color: COLORS[a.kind],
    href: withParams(sp, { edit: a.id, new: undefined }),
    readOnly: true,
  }))
  const away = [...new Set((rows ?? []).filter((a) => a.starts_on <= today && a.ends_on >= today).map((a) => a.employees?.name).filter(Boolean))]
  const here = `/hr/absences${withParams(sp, { edit: undefined, new: undefined, start: undefined, end: undefined, employee: undefined })}`
  const start = param(sp, "start")?.slice(0, 10) ?? ""
  const endRaw = param(sp, "end")
  // A drag/click ends at the next day's midnight: the absence's last day is the day before.
  const end = endRaw ? addDays(endRaw.slice(0, 10), endRaw.slice(11, 16) === "00:00" ? -1 : 0) : ""

  return (
    <Page>
      <PageHeader
        area="hr"
        title={t("hr.tabs.absences")}
        meta={away.length ? t("hr.awayToday", { names: t.list(away as string[]) }) : t("hr.nobodyAway")}
        primary={canManage ? { href: withParams(sp, { new: "absence", edit: undefined }), label: t("hr.addAbsence") } : undefined}
      />
      <Notice error={!editing && !creating ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
      <ListToolbar>
        {person && (
          <Button render={<Link href={`/hr/absences${withParams(sp, { person: undefined })}`} aria-label={`${person.name} – ${t("common.clear")}`} />} nativeButton={false} size="sm" variant="secondary">
            {person.name} <XIcon />
          </Button>
        )}
        <FilterMenu param="kind" label={t("hr.kind")} allLabel={t("hr.allKinds")} options={ABSENCE_KINDS.map((k) => ({ value: k, label: t.dynamic(`hr.kinds.${k}`) }))} />
      </ListToolbar>
      <CalendarView events={items} views={["month", "agenda"]} defaultView="month" newHref={canManage ? withParams(sp, { new: "absence", edit: undefined }) : undefined} newMinutes={24 * 60} />
      {(creating || editing) && (
        <AbsenceSheet
          t={t}
          absence={editing}
          employee={editing ? { id: editing.employee_id, name: editing.employees?.name ?? "" } : (prefill ?? person ?? null)}
          pick
          canManage={canManage}
          returnTo={here}
          defaults={{ start, end }}
          error={param(sp, "error")}
        />
      )}
    </Page>
  )
}

export const instant = false
