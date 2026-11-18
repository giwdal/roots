import { notFound } from "next/navigation"
import { DataTable } from "@/components/data-table"
import { Page, PageHeader } from "@/components/page"
import { Section } from "@/components/section"
import { Stat, Stats } from "@/components/stats"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { param } from "@/lib/url"
import { PRESETS, period } from "@/reports/period"
import { loadReport } from "@/reports/server"
import { GroupedBars, StackedBars } from "./charts"
import { DateInput } from "@/components/date-input"
import { PeriodMenu } from "./period-menu"

// Reports: KPIs per area for a period (presets or own range, in the URL). Each area only for those who may see it;
// every number links to the list behind it (when that module is on and the person may open it).
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requirePerm("reports.view")
  if (!ctx.modules.has("reports")) notFound()
  const t = await getT()
  const sp = await searchParams
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  const p = period(today, param(sp, "p"), param(sp, "from"), param(sp, "to"))
  const r = await loadReport(ctx.supabase, ctx.org.id, p.from, p.to)
  const day = (d: string) => t.date(d, { dateStyle: "medium" })
  const num = (n: number) => t.number(n)
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : "–")
  const e = r.events
  const admitted = e ? e.tickets_in + e.members_in + e.guests_in : 0
  // A tile's link: only when the target's module is on and the person may open it.
  const to = (module: string, perm: string, href: string) => (ctx.modules.has(module) && ctx.can(perm) ? href : undefined)
  const source = (k: string) => (t.has(`reports.sources.${k}`) ? t.dynamic(`reports.sources.${k}`) : t.has(`payments.sources.${k}`) ? t.dynamic(`payments.sources.${k}`) : k)

  return (
    <Page>
      <PageHeader area="reports" title={t("reports.title")} meta={t("reports.range", { from: day(p.from), to: day(p.to) })} />
      <div className="flex flex-wrap items-end gap-3">
        <PeriodMenu
          label={t("reports.period")}
          current={p.preset === "custom" ? t("reports.custom") : t.dynamic(`reports.presets.${p.preset}`)}
          options={PRESETS.map((k) => ({ value: k, label: t.dynamic(`reports.presets.${k}`), active: p.preset === k }))}
        />
        <form key={`${p.from}:${p.to}`} className="flex items-end gap-2" action="/reports">
          <div className="grid gap-1">
            <Label htmlFor="r-from" className="text-xs text-muted-foreground">
              {t("reports.from")}
            </Label>
            <DateInput id="r-from" name="from" type="date" defaultValue={p.from} className="w-36" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="r-to" className="text-xs text-muted-foreground">
              {t("reports.to")}
            </Label>
            <DateInput id="r-to" name="to" type="date" defaultValue={p.to} className="w-36" />
          </div>
          <Button type="submit" size="sm" variant="outline">
            {t("reports.show")}
          </Button>
        </form>
      </div>

      {r.members && (
        <Section id="members" title={t("reports.members.title")}>
          <Stats>
            <Stat href={to("members", "members.view", "/members")} label={t("reports.members.active")} value={num(r.members.active)} hint={t("reports.today")} />
            <Stat href={to("members", "members.view", "/members")} label={t("reports.members.joined")} value={num(r.members.joined)} />
            <Stat label={t("reports.members.left")} value={num(r.members.left)} />
            <Stat label={t("reports.members.paused")} value={num(r.members.paused)} hint={t("reports.today")} />
            <Stat label={t("reports.members.feeFree")} value={num(r.members.fee_free)} hint={t("reports.today")} />
            <Stat href={to("members", "members.view", "/members/dues?status=paid")} label={t("reports.members.duesPaid")} value={t.money(r.members.dues_paid_cents)} />
            <Stat href={to("members", "members.view", "/members/dues")} label={t("reports.members.duesOpen")} value={t.money(r.members.dues_open_cents)} hint={t("reports.today")} />
            <Stat
              href={to("members", "members.view", "/members/dues")}
              label={t("reports.members.duesOverdue")}
              value={t.money(r.members.dues_overdue_cents)}
              hint={t("reports.members.overduePeople", { count: r.members.dues_overdue_people })}
              tone={r.members.dues_overdue_cents > 0 ? "warn" : undefined}
            />
          </Stats>
          <div className="grid gap-6 md:grid-cols-2">
            <Bars title={t("reports.members.byType")} rows={r.members.by_type.map((x) => ({ label: x.type, value: x.active }))} t={t} />
            {r.members.months.length > 1 && (
              <div className="grid content-start gap-2">
                <h3 className="text-sm text-muted-foreground">{t("reports.members.perMonth")}</h3>
                <GroupedBars
                  data={r.members.months.map((m) => ({ label: t.date(`${m.month}-01`, { month: "short", year: "2-digit" }), joined: m.joined, left: m.left }))}
                  series={[
                    { key: "joined", label: t("reports.members.joined") },
                    { key: "left", label: t("reports.members.left") },
                  ]}
                />
              </div>
            )}
          </div>
        </Section>
      )}

      {e && (
        <Section id="events" title={t("reports.events.title")}>
          <Stats>
            <Stat href={to("events", "events.view", "/events")} label={t("reports.events.count")} value={num(e.count)} />
            {e.tickets && <Stat label={t("reports.events.sold")} value={num(e.sold)} />}
            {e.tickets && <Stat label={t("reports.events.revenue")} value={t.money(e.revenue_cents)} />}
            <Stat label={t("reports.events.admitted")} value={num(admitted)} />
            {e.tickets && <Stat label={t("reports.events.ticketsIn")} value={num(e.tickets_in)} />}
            {e.tickets && <Stat label={t("reports.events.membersIn")} value={num(e.members_in)} />}
            {e.guests && <Stat label={t("reports.events.guestsIn")} value={num(e.guests_in)} />}
          </Stats>
          {Object.keys(e.members_by_type).length > 0 && (
            <Bars title={t("reports.events.membersByType")} rows={Object.entries(e.members_by_type).map(([label, value]) => ({ label, value }))} t={t} />
          )}
          {e.list.length > 1 && (
            <div className="grid gap-2">
              <h3 className="text-sm text-muted-foreground">{t("reports.events.perEvent")}</h3>
              <StackedBars
                data={[...e.list].reverse().map((x) => ({ label: t.date(x.starts_at, { day: "2-digit", month: "2-digit" }), tickets: x.tickets_in, members: x.members_in, guests: x.guests_in }))}
                series={[
                  ...(e.tickets ? [{ key: "tickets", label: t("reports.events.ticketsIn") }, { key: "members", label: t("reports.events.membersIn") }] : []),
                  ...(e.guests ? [{ key: "guests", label: t("reports.events.guestsIn") }] : []),
                ]}
              />
            </div>
          )}
          <DataTable
            rows={e.list}
            rowKey={(x) => x.id}
            rowHref={(x) => to("events", "events.view", `/events/${x.id}`)}
            empty={t("reports.events.none")}
            columns={[
              {
                header: t("reports.events.event"),
                cell: (x) => (
                  <span className="grid min-w-0">
                    <span className="truncate font-medium">{x.title}</span>
                    <span className="text-xs font-normal text-muted-foreground">{t.date(x.starts_at, { dateStyle: "medium" })}</span>
                  </span>
                ),
              },
              ...(e.tickets
                ? [
                    { header: t("reports.events.sold"), cell: (x: (typeof e.list)[number]) => num(x.sold) },
                    { header: t("reports.events.revenue"), cell: (x: (typeof e.list)[number]) => t.money(x.revenue_cents) },
                    { header: t("reports.events.ticketsIn"), cell: (x: (typeof e.list)[number]) => num(x.tickets_in) },
                    {
                      header: t("reports.events.membersIn"),
                      cell: (x: (typeof e.list)[number]) => (
                        <span title={Object.entries(x.members_by_type).map(([k, v]) => `${k}: ${v}`).join(", ")}>{num(x.members_in)}</span>
                      ),
                    },
                  ]
                : []),
              ...(e.guests ? [{ header: t("reports.events.guestsIn"), cell: (x: (typeof e.list)[number]) => num(x.guests_in) }] : []),
              {
                header: t("reports.events.occupancy"),
                cell: (x) => (x.capacity ? pct(x.tickets_in + x.members_in + x.guests_in, x.capacity) : "–"),
              },
            ]}
          />
        </Section>
      )}

      {r.payments && (
        <Section id="payments" title={t("reports.payments.title")}>
          <Stats>
            <Stat href={to("payments", "payments.view", "/payments?status=paid")} label={t("reports.payments.gross")} value={t.money(r.payments.gross_cents)} />
            <Stat href={to("payments", "payments.view", "/payments?status=paid")} label={t("reports.payments.orders")} value={num(r.payments.orders)} />
            {Object.entries(r.payments.by_source).map(([k, v]) => (
              <Stat key={k} href={to("payments", "payments.view", `/payments?status=paid&source=${k}`)} label={source(k)} value={t.money(v)} />
            ))}
          </Stats>
        </Section>
      )}

      {r.invoices && (
        <Section id="invoices" title={t("reports.invoices.title")}>
          <Stats>
            <Stat href={to("invoices", "invoices.view", "/invoices?kind=invoice")} label={t("reports.invoices.issued")} value={t.money(r.invoices.issued_cents)} hint={t("reports.invoices.count", { count: r.invoices.issued })} />
            <Stat href={to("invoices", "invoices.view", "/invoices?kind=invoice&status=paid")} label={t("reports.invoices.paid")} value={t.money(r.invoices.paid_cents)} />
            <Stat href={to("invoices", "invoices.view", "/invoices?kind=invoice&status=sent")} label={t("reports.invoices.open")} value={t.money(r.invoices.open_cents)} hint={t("reports.today")} />
            <Stat href={to("invoices", "invoices.view", "/invoices?status=overdue")} label={t("reports.invoices.overdue")} value={t.money(r.invoices.overdue_cents)} hint={t("reports.today")} tone={r.invoices.overdue_cents > 0 ? "warn" : undefined} />
          </Stats>
        </Section>
      )}

      {r.cashbook && (
        <Section id="cashbook" title={t("reports.cashbook.title")}>
          <Stats>
            <Stat href={to("cashbook", "cashbook.view", "/cashbook")} label={t("reports.cashbook.income")} value={t.money(r.cashbook.income_cents)} />
            <Stat href={to("cashbook", "cashbook.view", "/cashbook")} label={t("reports.cashbook.expenses")} value={t.money(r.cashbook.expense_cents)} />
            <Stat label={t("reports.cashbook.result")} value={t.money(r.cashbook.income_cents - r.cashbook.expense_cents)} tone={r.cashbook.income_cents < r.cashbook.expense_cents ? "warn" : undefined} />
            {r.cashbook.accounts.map((a) => (
              <Stat key={a.name} href={to("cashbook", "cashbook.view", "/cashbook")} label={a.name} value={t.money(a.balance_cents)} hint={t("reports.cashbook.balances")} />
            ))}
          </Stats>
          {Object.keys(r.cashbook.by_sphere).length > 0 && (
            <div className="grid gap-2">
              <h3 className="text-sm text-muted-foreground">{t("reports.cashbook.bySphere")}</h3>
              <GroupedBars
                data={Object.entries(r.cashbook.by_sphere).map(([k, v]) => ({
                  label: k === "–" ? t("reports.cashbook.noSphere") : t.dynamic(`cashbook.spheres.${k}`),
                  income: v.income_cents / 100,
                  expenses: v.expense_cents / 100,
                }))}
                series={[
                  { key: "income", label: t("reports.cashbook.income") },
                  { key: "expenses", label: t("reports.cashbook.expenses") },
                ]}
              />
            </div>
          )}
        </Section>
      )}

      {r.shifts && (
        <Section id="shifts" title={t("reports.shifts.title")}>
          <Stats>
            <Stat href={to("shifts", "shifts.view", "/shifts")} label={t("reports.shifts.count")} value={num(r.shifts.count)} />
            <Stat label={t("reports.shifts.filled")} value={pct(r.shifts.assigned, r.shifts.needed)} hint={t("reports.shifts.slots", { assigned: r.shifts.assigned, needed: r.shifts.needed })} />
            <Stat href={to("shifts", "shifts.view", "/shifts/hours")} label={t("reports.shifts.hours")} value={t.number(r.shifts.worked_minutes / 60, { maximumFractionDigits: 1 })} />
          </Stats>
        </Section>
      )}

      {(r.contacts || r.forms || r.courses || r.email) && (
        <Section id="more" title={t("reports.more")}>
          <Stats>
            {r.contacts && <Stat href={to("crm", "crm.view", "/contacts")} label={t("reports.contacts.new")} value={num(r.contacts.new)} hint={t("reports.contacts.total", { count: r.contacts.total })} />}
            {r.forms && <Stat href={to("forms", "forms.view", "/forms")} label={t("reports.forms.submissions")} value={num(r.forms.submissions)} />}
            {r.courses && <Stat href={to("courses", "courses.view", "/courses")} label={t("reports.courses.enrolled")} value={num(r.courses.enrolled)} hint={t("reports.courses.waiting", { count: r.courses.waiting })} />}
            {r.email && <Stat href={to("email", "email.view", "/email/log")} label={t("reports.email.sent")} value={num(r.email.sent)} hint={t("reports.email.delivered", { rate: pct(r.email.delivered, r.email.sent) })} />}
            {r.email && r.email.bounced + r.email.complained > 0 && <Stat label={t("reports.email.bounced")} value={num(r.email.bounced + r.email.complained)} tone="warn" />}
          </Stats>
        </Section>
      )}
    </Page>
  )
}

// Horizontal bars, relative to the largest value. ponytail: CSS bars; a chart library when someone needs axes.
function Bars({ title, rows, t }: { title: string; rows: { label: string; value: number; extra?: string }[]; t: T }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <div className="grid content-start gap-2">
      <h3 className="text-sm text-muted-foreground">{title}</h3>
      {rows.length ? (
        <ul className="grid gap-1.5">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[6rem_1fr_auto] items-center gap-2 text-sm">
              <span className="truncate">{r.label}</span>
              <span className="h-2 rounded-full bg-muted">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${(r.value / max) * 100}%` }} />
              </span>
              <span className="tabular-nums">
                {t.number(r.value)}
                {r.extra && <span className="ml-1 text-muted-foreground">{r.extra}</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">–</p>
      )}
    </div>
  )
}

export const instant = false
