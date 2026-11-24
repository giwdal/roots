import { notFound } from "next/navigation"
import { BriefcaseBusinessIcon, CalendarClockIcon, Undo2Icon } from "lucide-react"
import { ActionsMenu, MenuLink, MenuSubmit } from "@/components/actions-menu"
import { ListToolbar } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { Page, PageHeader } from "@/components/page"
import { Stat, Stats } from "@/components/stats"
import { SubmitButton } from "@/components/submit-button"
import { hoursText, MonthNav, monthOf, TIME_COLS, TimeEntryList, TimeEntrySheet, type TimeRow } from "@/components/time-entries"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { minutes } from "@/shifts/time"
import { approveMonth } from "../../time-actions"

// Stunden › Person: one month of entries with warnings. shifts.manage/approve correct and add entries; the next step
// is approving the month (shifts.approve, asks first), after which the person can't change those entries any more.
export default async function PersonHours({ params, searchParams }: { params: Promise<{ staffId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePerm("shifts.view")
  if (!ctx.modules.has("shifts")) notFound()
  const { staffId } = await params
  if (!/^[0-9a-f-]{36}$/.test(staffId)) notFound()
  const sp = await searchParams
  const t = await getT()
  const month = monthOf(param(sp, "month"))
  const withHr = ctx.modules.has("hr") && ctx.can("hr.view")
  const [{ data: person }, { data: rows }, { data: planned }, { data: employee }] = await Promise.all([
    ctx.supabase.from("staff").select("id, name, target_hours, role_label").eq("id", staffId).eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("time_entries").select(TIME_COLS).eq("org_id", ctx.org.id).eq("staff_id", staffId).gte("started_at", month.from).lt("started_at", month.to).order("started_at"),
    ctx.supabase.from("shift_assignments").select("shifts!inner(starts_at, ends_at)").eq("org_id", ctx.org.id).eq("staff_id", staffId).eq("status", "assigned").gte("shifts.starts_at", month.from).lt("shifts.starts_at", month.to),
    withHr ? ctx.supabase.from("employees").select("id").eq("org_id", ctx.org.id).eq("staff_id", staffId).is("deleted_at", null).maybeSingle() : Promise.resolve({ data: null }),
  ])
  if (!person) notFound()
  const entries = (rows ?? []) as TimeRow[]
  const canEdit = ctx.can("shifts.manage") || ctx.can("shifts.approve")
  const canApprove = ctx.can("shifts.approve")
  const base = `/shifts/hours/${staffId}`
  const here = `${base}${withParams(sp, { edit: undefined, new: undefined })}`
  const editing = entries.find((e) => e.id === param(sp, "edit"))
  const done = entries.filter((e) => e.ended_at)
  const open = done.filter((e) => !e.approved_at).length
  const total = done.reduce((s, e) => s + minutes(e).net, 0)
  const plannedMin = (planned ?? []).reduce((sum, r) => sum + (new Date(r.shifts.ends_at).getTime() - new Date(r.shifts.starts_at).getTime()) / 60_000, 0)
  const target = person.target_hours != null ? Number(person.target_hours) * 60 : null
  const monthName = t.date(`${month.month}-15T12:00:00Z`, { month: "long", year: "numeric" })

  return (
    <Page>
      <PageHeader
        crumbs={[{ href: `/shifts/hours?month=${month.month}`, label: t("shifts.tabs.hours") }, { label: person.name }]}
        title={person.name}
        badge={done.length > 0 && (open ? <Badge variant="warning">{t("time.toApprove", { count: open })}</Badge> : <Badge variant="success">{t("time.approvedBadge")}</Badge>)}
        meta={person.role_label}
        menu={
          (withHr && employee) || ctx.can("shifts.manage") || (canApprove && done.length > open) ? (
            <ActionsMenu>
              {canApprove && done.length > open && (
                <MenuSubmit form="reopen-month" icon={<Undo2Icon />} confirm="time.confirmReopen">
                  {t("time.reopen")}
                </MenuSubmit>
              )}
              {withHr && employee && (
                <MenuLink href={`/hr/${employee.id}`} icon={<BriefcaseBusinessIcon />}>
                  {t("shifts.hrRecord")}
                </MenuLink>
              )}
              {ctx.can("shifts.manage") && (
                <MenuLink href={`/shifts/team?edit=${staffId}`} icon={<CalendarClockIcon />}>
                  {t("shifts.teamProfile")}
                </MenuLink>
              )}
            </ActionsMenu>
          ) : undefined
        }
        primary={canEdit ? { href: `${base}${withParams(sp, { new: "time", edit: undefined })}`, label: t("time.add") } : undefined}
      />
      <Notice error={!editing && param(sp, "new") !== "time" ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
      <ListToolbar>
        <MonthNav month={month} href={(m) => `${base}?month=${m}`} />
      </ListToolbar>
      <Stats>
        <Stat label={t("shifts.worked")} value={hoursText(t, total)} />
        <Stat label={t("shifts.targetHours")} value={target != null ? hoursText(t, target) : "–"} />
        <Stat label={t("shifts.balance")} value={target != null ? `${total >= target ? "+" : "−"}${hoursText(t, Math.abs(total - target))}` : "–"} />
        <Stat label={t("shifts.planned")} value={hoursText(t, plannedMin)} hint={t("shifts.shiftCountShort", { count: planned?.length ?? 0 })} />
      </Stats>
      {canApprove && open > 0 && (
        <form action={approveMonth} className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
          <input type="hidden" name="staff" value={staffId} />
          <input type="hidden" name="month" value={month.month} />
          <input type="hidden" name="return" value={here} />
          <p className="min-w-0 flex-1 text-sm">{t("time.approveNext", { count: open, month: monthName })}</p>
          <SubmitButton size="sm" className="max-sm:w-full max-sm:h-10" data-confirm="time.confirmApprove" data-confirm-count={open}>
            {t("time.approveMonth", { count: open })}
          </SubmitButton>
        </form>
      )}
      {canApprove && done.length > open && (
        <form id="reopen-month" action={approveMonth} hidden>
          <input type="hidden" name="staff" value={staffId} />
          <input type="hidden" name="month" value={month.month} />
          <input type="hidden" name="return" value={here} />
          <input type="hidden" name="undo" value="1" />
        </form>
      )}
      <TimeEntryList rows={entries} editHref={(id) => (canEdit ? `${base}${withParams(sp, { edit: id, new: undefined })}` : null)} />
      {canEdit && (param(sp, "new") === "time" || editing) && (
        <TimeEntrySheet
          params={["new", "edit"]}
          entry={editing}
          staff={{ id: staffId, name: person.name }}
          returnTo={here}
          canDelete={ctx.can("shifts.manage")}
          pickProject={ctx.modules.has("projects") && (ctx.can("projects.view") || ctx.can("projects.manage"))}
          error={param(sp, "error")}
        />
      )}
    </Page>
  )
}

export const instant = false
