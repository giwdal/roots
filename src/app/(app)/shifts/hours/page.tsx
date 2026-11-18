import Link from "next/link"
import { notFound } from "next/navigation"
import { PlusIcon } from "lucide-react"
import { ActionsMenu, MenuExport } from "@/components/actions-menu"
import { DataTable, ListToolbar } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { Stat, Stats } from "@/components/stats"
import { SubmitButton } from "@/components/submit-button"
import { hoursText, MonthNav, monthOf } from "@/components/time-entries"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param } from "@/lib/url"
import { minutes, warnings } from "@/shifts/time"
import { approveAll } from "../time-actions"

// Schichten › Stunden: the month per person (planned shifts, worked time net of breaks, target, balance, approval,
// law warnings). The month switch is the toolbar; a row opens the person's month (correct, approve).
export default async function HoursPage({ searchParams }: PageProps<"/shifts/hours">) {
  const ctx = await requirePerm("shifts.view")
  if (!ctx.modules.has("shifts")) notFound()
  const t = await getT()
  const sp = await searchParams
  const month = monthOf(param(sp, "month"))
  const [{ data: staff }, { data: planned }, { data: entries }] = await Promise.all([
    ctx.supabase.from("staff").select("id, name, target_hours, active").eq("org_id", ctx.org.id).order("name"),
    ctx.supabase.from("shift_assignments").select("staff_id, shifts!inner(starts_at, ends_at)").eq("org_id", ctx.org.id).eq("status", "assigned").gte("shifts.starts_at", month.from).lt("shifts.starts_at", month.to),
    ctx.supabase.from("time_entries").select("id, staff_id, started_at, ended_at, break_minutes, approved_at").eq("org_id", ctx.org.id).gte("started_at", month.from).lt("started_at", month.to),
  ])
  const table = (staff ?? [])
    .map((s) => {
      const shifts = (planned ?? []).filter((r) => r.staff_id === s.id)
      const mine = (entries ?? []).filter((e) => e.staff_id === s.id)
      const done = mine.filter((e) => e.ended_at)
      return {
        ...s,
        count: shifts.length,
        planned: shifts.reduce((sum, r) => sum + (new Date(r.shifts.ends_at).getTime() - new Date(r.shifts.starts_at).getTime()) / 60_000, 0),
        worked: done.reduce((sum, e) => sum + minutes(e).net, 0),
        entries: mine.length,
        unapproved: done.filter((e) => !e.approved_at).length,
        warned: [...warnings(mine).values()].filter((w) => w.length).length,
      }
    })
    .filter((s) => s.active || s.count || s.entries)
  const unapproved = table.reduce((n, s) => n + s.unapproved, 0)
  const worked = table.reduce((n, s) => n + s.worked, 0)
  const warned = table.reduce((n, s) => n + s.warned, 0)
  const canApprove = ctx.can("shifts.approve")

  return (
    <Page>
      <PageHeader
        area="shifts"
        title={t("shifts.tabs.hours")}
        actions={
          canApprove &&
          unapproved > 0 && (
            <form action={approveAll}>
              <input type="hidden" name="month" value={month.month} />
              <SubmitButton size="sm" variant="outline" data-confirm="time.confirmApproveAll" data-confirm-count={unapproved}>
                {t("time.approveAll")}
              </SubmitButton>
            </form>
          )
        }
        menu={
          <ActionsMenu>
            <MenuExport entity="hours" query={{ month: month.month }} label={t("time.exportTotals")} />
            <MenuExport entity="time" query={{ month: month.month }} label={t("time.exportEntries")} />
          </ActionsMenu>
        }
      />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <ListToolbar>
        <MonthNav month={month} href={(m) => `/shifts/hours?month=${m}`} />
      </ListToolbar>
      {table.length > 0 && (
        <Stats>
          <Stat label={t("shifts.worked")} value={hoursText(t, worked)} hint={t("shifts.workedHint")} />
          <Stat label={t("time.openToApprove")} value={unapproved} hint={unapproved > 0 ? t("time.missingInExport") : t("time.allApproved")} tone={unapproved > 0 ? "warn" : undefined} />
          <Stat label={t("time.notices")} value={warned} hint={t("time.noticesHint")} tone={warned > 0 ? "warn" : undefined} />
        </Stats>
      )}
      <DataTable
        rows={table}
        rowKey={(s) => s.id}
        rowHref={(s) => `/shifts/hours/${s.id}?month=${month.month}`}
        empty={
          <EmptyState
            area="shifts"
            title={t("shifts.noStaff")}
            text={t("shifts.noStaffText")}
            action={
              ctx.can("shifts.manage") && (
                <Button render={<Link href="/shifts/team?new=staff" />} nativeButton={false} size="sm">
                  <PlusIcon /> {t("shifts.addStaff")}
                </Button>
              )
            }
          />
        }
        columns={[
          {
            header: t("shifts.name"),
            cell: (s) => (
              <span className="grid">
                <span className="font-medium">{s.name}</span>
                {s.target_hours != null && <span className="text-xs font-normal text-muted-foreground">{t("shifts.selfTarget", { hours: t.number(Number(s.target_hours)) })}</span>}
              </span>
            ),
          },
          { header: t("shifts.planned"), cell: (s) => `${hoursText(t, s.planned)} · ${t("shifts.shiftCountShort", { count: s.count })}`, className: "tabular-nums" },
          { header: t("shifts.worked"), cell: (s) => hoursText(t, s.worked), className: "tabular-nums" },
          {
            header: t("shifts.balance"),
            cell: (s) => {
              if (s.target_hours == null) return "–"
              const diff = s.worked - Number(s.target_hours) * 60
              return <span className={diff < 0 ? "text-muted-foreground" : "font-medium"}>{`${diff >= 0 ? "+" : "−"}${hoursText(t, Math.abs(diff))}`}</span>
            },
            className: "tabular-nums",
          },
          {
            header: t("time.status"),
            cell: (s) => (
              <span className="flex flex-wrap gap-1">
                {s.entries === 0 ? "–" : s.unapproved ? <Badge variant="warning">{t("time.toApprove", { count: s.unapproved })}</Badge> : <Badge variant="success">{t("time.approvedBadge")}</Badge>}
                {s.warned > 0 && <Badge variant="destructive">{t("time.warningCount", { count: s.warned })}</Badge>}
              </span>
            ),
          },
        ]}
      />
    </Page>
  )
}

export const instant = false
