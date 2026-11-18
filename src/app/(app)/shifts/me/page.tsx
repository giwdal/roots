import Link from "next/link"
import { notFound } from "next/navigation"
import { PlusIcon } from "lucide-react"
import { ListToolbar } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { RecordPicker } from "@/components/record-picker"
import { AddLink, Section } from "@/components/section"
import { ShiftSelfView } from "@/components/shift-self-view"
import { Stat, Stats } from "@/components/stats"
import { SubmitButton } from "@/components/submit-button"
import { hoursText, MonthNav, monthOf, TIME_COLS, TimeEntryList, TimeEntrySheet, type TimeRow } from "@/components/time-entries"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { selfView, type SelfShift } from "@/shifts/server"
import { minutes } from "@/shifts/time"
import { selfAction } from "../actions"
import { clock, searchProjects } from "../time-actions"
import { PlanViews } from "../views"

// Schichten › Meine: a team member's day on the phone. The Jetzt card holds the one main thing (clock out of what runs,
// clock into the shift that starts now, or clock in without a shift), then own shifts, open shifts and the month's times.
export default async function MyShifts({ searchParams }: PageProps<"/shifts/me">) {
  const ctx = await requirePerm("shifts.self")
  if (!ctx.modules.has("shifts")) notFound()
  const t = await getT()
  const sp = await searchParams
  const month = monthOf(param(sp, "month"))
  const views = ctx.can("shifts.view") && <ListToolbar><PlanViews t={t} current="me" /></ListToolbar>
  const { data: staffId } = await ctx.supabase.rpc("my_staff_id", { p_org: ctx.org.id })
  if (!staffId)
    return (
      <Page>
        <PageHeader area="shifts" title={t("shifts.tabs.mine")} />
        {views}
        <EmptyState
          area="shifts"
          title={t("shifts.notInTeam")}
          text={t("shifts.notInTeamText")}
          action={
            ctx.can("shifts.manage") && (
              <Button render={<Link href={`/shifts/team?new=staff&user=${ctx.userId}`} />} nativeButton={false} size="sm">
                <PlusIcon /> {t("shifts.addMe")}
              </Button>
            )
          }
        />
      </Page>
    )
  const withProjects = ctx.modules.has("projects") && (ctx.can("projects.view") || ctx.can("projects.manage"))
  const [data, { data: rows }, { data: running }] = await Promise.all([
    selfView(staffId),
    ctx.supabase.from("time_entries").select(TIME_COLS).eq("staff_id", staffId).gte("started_at", month.from).lt("started_at", month.to).order("started_at"),
    ctx.supabase.from("time_entries").select("id, started_at, shift_id, projects(name)").eq("staff_id", staffId).is("ended_at", null).maybeSingle(),
  ])
  const entries = (rows ?? []) as TimeRow[]
  const editing = entries.find((e) => e.id === param(sp, "edit") && !e.approved_at)
  const here = `/shifts/me${withParams(sp, { edit: undefined, new: undefined })}`
  const total = entries.filter((e) => e.ended_at).reduce((s, e) => s + minutes(e).net, 0)
  const target = data?.me.target_hours != null ? Number(data.me.target_hours) : null
  const own = data?.own ?? []
  const now = new Date().getTime()
  const inWindow = (s: SelfShift) => now >= new Date(s.starts_at).getTime() - 2 * 3600_000 && now <= new Date(s.ends_at).getTime() + 2 * 3600_000
  const runningShift = running?.shift_id ? own.find((s) => s.id === running.shift_id) : null
  const current = !running ? own.find((s) => s.status === "assigned" && !s.checked_in_at && inWindow(s)) : null
  const next = own.find((s) => s.status === "assigned" && new Date(s.starts_at).getTime() > now)
  const label = (s: SelfShift) => [s.position ?? s.title, s.event].filter(Boolean).join(" · ")
  const span = (s: SelfShift) => `${t.date(s.starts_at, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}–${t.date(s.ends_at, { hour: "2-digit", minute: "2-digit" })}`
  const clockTime = (v: string) => t.date(v, { hour: "2-digit", minute: "2-digit" })
  const big = "h-12 w-full text-base md:w-auto md:min-w-48"

  return (
    <Page>
      <PageHeader area="shifts" title={t("shifts.tabs.mine")} primary={{ href: `/shifts/me${withParams(sp, { new: "time", edit: undefined })}`, label: t("time.add") }} />
      <Notice error={!editing && param(sp, "new") !== "time" ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
      {views}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] md:items-start">
        {/* Jetzt: the one main action of this page. */}
        <section aria-labelledby="now" className="grid gap-3 rounded-xl border bg-card p-4">
          {running ? (
            <>
              <div className="grid gap-0.5">
                <p className="text-sm text-muted-foreground">{t("time.since", { time: clockTime(running.started_at) })}</p>
                <h2 id="now" className="text-lg font-medium">
                  {runningShift ? label(runningShift) : (running.projects?.name ?? t("shifts.withoutShift"))}
                </h2>
              </div>
              <form action={runningShift ? selfAction : clock}>
                {runningShift ? (
                  <>
                    <input type="hidden" name="shift" value={runningShift.id} />
                    <input type="hidden" name="action" value="check_out" />
                  </>
                ) : (
                  <input type="hidden" name="return" value={here} />
                )}
                <SubmitButton className={big}>{t("time.clockOut")}</SubmitButton>
              </form>
            </>
          ) : current ? (
            <>
              <div className="grid gap-0.5">
                <p className="text-sm text-muted-foreground">{span(current)}</p>
                <h2 id="now" className="text-lg font-medium">
                  {label(current)}
                </h2>
                {current.location && <p className="text-sm text-muted-foreground">{current.location}</p>}
              </div>
              <form action={selfAction}>
                <input type="hidden" name="shift" value={current.id} />
                <input type="hidden" name="action" value="check_in" />
                <SubmitButton className={big}>{t("shifts.checkIn")}</SubmitButton>
              </form>
            </>
          ) : (
            <>
              <div className="grid gap-0.5">
                <p className="text-sm text-muted-foreground">{next ? t("shifts.nextShift", { when: span(next) }) : t("shifts.noShiftNow")}</p>
                <h2 id="now" className="text-lg font-medium">
                  {next ? label(next) : t("shifts.withoutShift")}
                </h2>
              </div>
              <form action={clock} className="grid gap-3">
                <input type="hidden" name="return" value={here} />
                {withProjects && <RecordPicker name="project_id" label={t("time.projectOptional")} search={searchProjects} placeholder={t("time.noProject")} />}
                <SubmitButton className={big}>{t("shifts.clockInFree")}</SubmitButton>
              </form>
            </>
          )}
        </section>
        <Stats className="sm:grid-cols-2 md:grid-cols-1">
          <Stat label={t("shifts.workedIn", { month: t.date(`${month.month}-15T12:00:00Z`, { month: "long" }) })} value={hoursText(t, total)} />
          {target != null && <Stat label={t("shifts.targetHours")} value={`${t.number(target)} h`} hint={t("shifts.balanceHint", { hours: `${total >= target * 60 ? "+" : "−"}${hoursText(t, Math.abs(total - target * 60))}` })} />}
        </Stats>
      </div>

      {data && <ShiftSelfView data={data} action={selfAction} />}

      <Section id="time" title={t("time.entries")} action={<MonthNav month={month} href={(m) => `/shifts/me?month=${m}`} />}>
        <TimeEntryList rows={entries} editHref={(id) => (entries.find((e) => e.id === id)?.approved_at ? null : `/shifts/me${withParams(sp, { edit: id, new: undefined })}`)} />
        <AddLink href={`/shifts/me${withParams(sp, { new: "time", edit: undefined })}`}>{t("time.add")}</AddLink>
      </Section>

      {(param(sp, "new") === "time" || editing) && <TimeEntrySheet params={["new", "edit"]} entry={editing} returnTo={here} canDelete pickProject={withProjects} error={param(sp, "error")} />}
    </Page>
  )
}

export const instant = false
