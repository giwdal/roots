import Link from "next/link"
import { notFound } from "next/navigation"
import { PlusIcon } from "lucide-react"
import { ListToolbar } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { AddLink, Section } from "@/components/section"
import { ShiftSelfView } from "@/components/shift-self-view"
import { Stat, Stats } from "@/components/stats"
import { hoursText, MonthNav, monthOf, TIME_COLS, TimeEntryList, TimeEntrySheet, type TimeRow } from "@/components/time-entries"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { selfView } from "@/shifts/server"
import { minutes } from "@/shifts/time"
import { selfAction } from "../actions"
import { NowCard } from "../now-card"
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

  return (
    <Page>
      <PageHeader area="shifts" title={t("shifts.tabs.mine")} primary={{ href: `/shifts/me${withParams(sp, { new: "time", edit: undefined })}`, label: t("time.add") }} />
      <Notice error={!editing && param(sp, "new") !== "time" ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
      {views}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] md:items-start">
        {/* Jetzt: the one main action of this page. */}
        <NowCard own={own} running={running} returnTo={here} withProjects={withProjects} />
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
