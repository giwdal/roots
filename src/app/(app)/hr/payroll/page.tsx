import Link from "next/link"
import { PlusIcon } from "lucide-react"
import { ActionsMenu, MenuExport } from "@/components/actions-menu"
import { DataTable, ListToolbar } from "@/components/data-table"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { Stat, Stats } from "@/components/stats"
import { MonthNav } from "@/components/time-entries"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { payrollMonth } from "@/hr/server"
import { requirePerm } from "@/lib/context"
import { monthOf } from "@/lib/time"
import { param } from "@/lib/url"

// Personal › Lohn: payroll preparation per month: approved hours (from shifts), absences, gross preview, warnings
// (Minijob limit, minimum wage). roots doesn't run payroll: the export goes to the tax advisor / payroll software.
export default async function PayrollPage({ searchParams }: PageProps<"/hr/payroll">) {
  const ctx = await requirePerm("hr.view")
  const t = await getT()
  const sp = await searchParams
  const month = monthOf(param(sp, "month"))
  const rows = await payrollMonth(ctx.supabase, ctx.org.id, month)
  const hours = (m: number) => t.number(m / 60, { maximumFractionDigits: 2 })
  const open = rows.reduce((n, r) => n + r.unapproved_entries, 0)
  const gross = rows.reduce((n, r) => n + (r.gross_cents ?? 0), 0)
  const approved = rows.reduce((n, r) => n + r.approved_minutes, 0)
  const warned = rows.filter((r) => r.warnings.length).length
  const toHours = ctx.modules.has("shifts") && ctx.can("shifts.view") ? `/shifts/hours?month=${month.month}` : undefined

  return (
    <Page>
      <PageHeader
        area="hr"
        title={t("hr.tabs.payroll")}
        menu={
          <ActionsMenu>
            <MenuExport entity="payroll" query={{ month: month.month }} />
          </ActionsMenu>
        }
      />
      <ListToolbar>
        <MonthNav month={month} href={(m) => `/hr/payroll?month=${m}`} />
      </ListToolbar>
      {rows.length > 0 && (
        <Stats>
          <Stat label={t("hr.grossTotal")} value={t.money(gross)} />
          <Stat label={t("hr.approvedHoursStat")} value={`${hours(approved)} h`} />
          <Stat label={t("time.openToApprove")} value={open} hint={open > 0 ? t("hr.openHint") : t("time.allApproved")} href={open > 0 ? toHours : undefined} tone={open > 0 ? "warn" : undefined} />
          <Stat label={t("hr.notesShort")} value={warned} tone={warned > 0 ? "warn" : undefined} />
        </Stats>
      )}
      <DataTable
        rows={rows}
        rowKey={(r) => r.employee_id}
        rowHref={(r) => `/hr/${r.employee_id}#pay`}
        empty={
          <EmptyState
            area="hr"
            title={t("hr.empty")}
            text={t("hr.emptyText")}
            action={
              ctx.can("hr.manage") && (
                <Button render={<Link href="/hr/new" />} nativeButton={false} size="sm">
                  <PlusIcon /> {t("hr.new")}
                </Button>
              )
            }
          />
        }
        columns={[
          {
            header: t("hr.name"),
            cell: (r) => (
              <span className="grid">
                <span className="font-medium">{r.name}</span>
                <span className="text-xs font-normal text-muted-foreground">{t.dynamic(`hr.types.${r.employment_type}`)}</span>
              </span>
            ),
          },
          { header: t("hr.hours"), cell: (r) => hours(r.approved_minutes), className: "tabular-nums", phone: false },
          { header: t("hr.hours"), cell: (r) => `${hours(r.approved_minutes)} h`, table: false },
          {
            header: t("hr.rate"),
            cell: (r) => (r.pay_type === "hourly" && r.hourly_rate_cents != null ? `${t.money(r.hourly_rate_cents)}/h` : r.pay_type === "monthly" && r.monthly_salary_cents != null ? t.money(r.monthly_salary_cents) : "–"),
            className: "tabular-nums",
            phone: false,
          },
          { header: t("hr.grossShort"), cell: (r) => (r.gross_cents != null ? t.money(r.gross_cents) : "–"), className: "text-right tabular-nums" },
          {
            header: t("hr.tabs.absences"),
            cell: (r) =>
              [r.vacation_days && `${t.dynamic("hr.kinds.vacation")} ${t.number(r.vacation_days)}`, r.sick_days && `${t.dynamic("hr.kinds.sick")} ${t.number(r.sick_days)}`, r.other_absence_days && `${t("hr.otherAbsence")} ${t.number(r.other_absence_days)}`]
                .filter(Boolean)
                .join(" · ") || "–",
          },
          {
            header: t("hr.notesShort"),
            cell: (r) =>
              r.warnings.length || r.unapproved_entries ? (
                <span className="flex flex-wrap gap-1">
                  {r.warnings.map((w) => (
                    <Badge key={w} variant="destructive">
                      {t.dynamic(`hr.payWarnings.${w}`)}
                    </Badge>
                  ))}
                  {r.unapproved_entries > 0 && <Badge variant="warning">{t("time.toApprove", { count: r.unapproved_entries })}</Badge>}
                </span>
              ) : (
                "–"
              ),
          },
        ]}
      />
      {rows.length > 0 && <p className="text-xs text-muted-foreground">{t("hr.payrollHint")}</p>}
    </Page>
  )
}

export const instant = false
