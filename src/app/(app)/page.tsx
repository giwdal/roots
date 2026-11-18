import Link from "next/link"
import { ChevronRightIcon, HouseIcon, InboxIcon } from "lucide-react"
import { AreaIcon } from "@/components/area-icon"
import { Notice } from "@/components/notice"
import { Page, PageHeader } from "@/components/page"
import { Section } from "@/components/section"
import { SproutAsk } from "@/components/sprout/ask"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { renderEvent } from "@/events/render"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { quickActions } from "@/lib/quick-actions"
import { titled } from "@/lib/title"
import { cn } from "@/lib/utils"
import { param } from "@/lib/url"
import { NAV } from "@/modules/nav"
import type { SelfShift } from "@/shifts/server"
import { NowCard, type Running } from "./shifts/now-card"
import { TaskDrawer } from "./projects/task-drawer"

export const generateMetadata = titled("shell.home")

const none = Promise.resolve({ data: null, count: null })
const area = (key: string) => NAV.find((a) => a.key === key)!

// Start, per person (Linear "My issues" + inbox, Shopify "things to do"): first what needs *me* — the Jetzt card for
// people on the shift team, "Wartet auf dich" (counts that open the filtered list, only modules that are on and
// permitted, hidden at 0), my tasks; then what's on (events, my next shifts), quick actions, the latest notifications.
// All reads run in one round after the context (the shift branch takes one more for the staff id).
export default async function HomePage({ searchParams }: PageProps<"/">) {
  const ctx = await getContext()
  const t = await getT()
  const sp = await searchParams
  const on = (m: string, p: string) => ctx.modules.has(m) && ctx.can(p)
  const org = ctx.org.id
  const now = new Date()
  const today = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  const head = { count: "exact" as const, head: true }

  const [{ data: tasks }, shifts, { data: events }, dues, invoices, orders, submissions, hours, { data: inbox, count: unread }] = await Promise.all([
    on("projects", "projects.view")
      ? ctx.supabase
          .from("tasks")
          .select("id, title, due_on, task_assignees!inner(user_id)")
          .eq("org_id", org)
          .eq("task_assignees.user_id", ctx.userId)
          .is("completed_at", null)
          .is("deleted_at", null)
          .order("due_on", { nullsFirst: false })
          .limit(50)
      : none,
    on("shifts", "shifts.self") ? myShifts(ctx, now) : Promise.resolve(null),
    on("events", "events.view")
      ? ctx.supabase.from("events").select("id, title, starts_at, status").eq("org_id", org).is("deleted_at", null).neq("status", "cancelled").gte("starts_at", `${today}T00:00:00`).order("starts_at").limit(4)
      : none,
    on("members", "members.manage") ? ctx.supabase.from("member_dues").select("id", head).eq("org_id", org).eq("status", "open").lt("due_on", today) : none,
    on("invoices", "invoices.view") ? ctx.supabase.from("documents").select("id", head).eq("org_id", org).eq("kind", "invoice").eq("status", "sent").lt("due_date", today) : none,
    on("shop", "shop.manage") ? ctx.supabase.from("shop_orders").select("id", head).eq("org_id", org).not("placed_at", "is", null).in("status", ["new", "ready"]) : none,
    on("forms", "forms.view") ? ctx.supabase.from("form_submissions").select("id", head).eq("org_id", org).eq("status", "new") : none,
    on("shifts", "shifts.approve") ? ctx.supabase.from("time_entries").select("id", head).eq("org_id", org).is("approved_at", null).not("ended_at", "is", null) : none,
    ctx.supabase.from("notifications").select("id, created_at, events:hub_events(type, payload)", { count: "exact" }).eq("user_id", ctx.userId).is("read_at", null).order("created_at", { ascending: false }).limit(3),
  ])

  const due = (tasks ?? []).filter((x) => x.due_on && x.due_on <= today)
  // Things waiting for this person, each a count that opens the list already filtered to them.
  const waiting = [
    { key: "tasks", area: "projects", count: due.length, label: t("home.waiting.tasks", { count: due.length }), href: "/projects/tasks" },
    { key: "hours", area: "shifts", count: hours.count ?? 0, label: t("home.waiting.hours", { count: hours.count ?? 0 }), href: "/shifts/hours" },
    { key: "submissions", area: "communication", count: submissions.count ?? 0, label: t("home.waiting.submissions", { count: submissions.count ?? 0 }), href: "/forms" },
    { key: "orders", area: "shop", count: orders.count ?? 0, label: t("home.waiting.orders", { count: orders.count ?? 0 }), href: "/shop/orders" },
    { key: "invoices", area: "finance", count: invoices.count ?? 0, label: t("home.waiting.invoices", { count: invoices.count ?? 0 }), href: "/invoices?status=overdue", warn: true },
    { key: "dues", area: "members", count: dues.count ?? 0, label: t("home.waiting.dues", { count: dues.count ?? 0 }), href: "/members/dues", warn: true },
  ].filter((w) => w.count > 0)
  const quick = quickActions((m) => ctx.modules.has(m), ctx.can, t)
  const day = (v: string) => (v.slice(0, 10) === today ? t("home.todayAt", { time: t.date(v, { hour: "2-digit", minute: "2-digit" }) }) : t.date(v, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))
  const taskDue = (d: string) => (d === today ? t("home.today") : t.date(`${d}T12:00:00`, { weekday: "short", day: "numeric", month: "short" }))
  const nextShifts = (shifts?.own ?? []).filter((s) => s.status === "assigned" && new Date(s.starts_at) > now).slice(0, 3)

  return (
    <Page>
      <PageHeader icon={HouseIcon} title={t("shell.home")} meta={`${ctx.org.name} · ${t.date(now.toISOString(), { dateStyle: "full" })}`} />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <div className="grid min-w-0 gap-6">
          {shifts && <NowCard own={shifts.own} running={shifts.running} returnTo="/" withProjects={ctx.modules.has("projects") && ctx.can("projects.view")} />}

          <Section id="waiting" title={t("home.waitingTitle")}>
            {waiting.length || unread ? (
              <ul className="divide-y rounded-xl border">
                {waiting.map((w) => (
                  <Row key={w.key} href={w.href} icon={<AreaIcon area={w.area} icon={area(w.area).icon} className="size-7" />} label={w.label} end={<Badge variant={w.warn ? "destructive" : "secondary"}>{w.count}</Badge>} />
                ))}
                {!!unread && (
                  <Row
                    href="/notifications?filter=unread"
                    icon={
                      <span className="grid size-7 shrink-0 place-items-center rounded-[0.35rem] bg-muted text-muted-foreground" aria-hidden>
                        <InboxIcon className="size-4" />
                      </span>
                    }
                    label={t("home.waiting.unread", { count: unread })}
                    end={<Badge variant="info">{unread}</Badge>}
                  />
                )}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("home.allClear")}</p>
            )}
          </Section>

          {tasks && (
            <Section id="tasks" title={t("home.myTasks")} action={<More href="/projects/tasks" label={t("home.all")} />}>
              {tasks.length ? (
                <ul className="divide-y rounded-xl border">
                  {tasks.slice(0, 6).map((x) => (
                    <Row key={x.id} href={`/?task=${x.id}`} label={x.title} end={x.due_on ? <span className={cn("text-xs tabular-nums", x.due_on < today ? "font-medium text-destructive" : "text-muted-foreground")}>{taskDue(x.due_on)}</span> : null} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("home.noTasks")}</p>
              )}
            </Section>
          )}
          <SproutAsk />
        </div>

        <div className="grid min-w-0 gap-6">
          {events && (
            <Section id="events" title={t("home.nextEvents")} action={<More href="/events" label={t("home.all")} />}>
              {events.length ? (
                <ul className="divide-y rounded-xl border">
                  {events.map((e) => (
                    <Row key={e.id} href={`/events/${e.id}`} label={e.title} detail={day(e.starts_at)} end={e.status === "draft" ? <Badge variant="secondary">{t("eventsPage.statuses.draft")}</Badge> : null} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("home.noEvents")}</p>
              )}
            </Section>
          )}
          {shifts && (
            <Section id="shifts" title={t("home.myShifts")} action={<More href="/shifts/me" label={t("home.all")} />}>
              {nextShifts.length ? (
                <ul className="divide-y rounded-xl border">
                  {nextShifts.map((s) => (
                    <Row key={s.id} href="/shifts/me" label={[s.position ?? s.title, s.event].filter(Boolean).join(" · ") || t("shifts.title")} detail={day(s.starts_at)} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("home.noShifts")}</p>
              )}
            </Section>
          )}
          {quick.length > 0 && (
            <Section id="quick" title={t("search.quick")}>
              <div className="flex flex-wrap gap-2">
                {quick.map((q) => (
                  <Button key={q.href} render={<Link href={q.href} />} nativeButton={false} variant="outline" size="sm">
                    {q.label}
                  </Button>
                ))}
              </div>
            </Section>
          )}
          {!!inbox?.length && (
            <Section id="inbox" title={t("inbox.title")} action={<More href="/notifications" label={t("home.all")} />}>
              <ul className="divide-y rounded-xl border">
                {inbox.map((n) => (
                  <Row key={n.id} href={`/notifications/${n.id}`} label={n.events ? renderEvent(n.events, t.locale).title : "–"} detail={t.date(n.created_at, { dateStyle: "short", timeStyle: "short" })} />
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
      <TaskDrawer ctx={ctx} t={t} id={param(sp, "task")} back="/" error={param(sp, "error")} ok={param(sp, "ok")} />
    </Page>
  )
}

// The person's own shifts (assigned, from 2 h ago on) and what runs on the clock: the Jetzt card and "Meine Schichten".
async function myShifts(ctx: Awaited<ReturnType<typeof getContext>>, now: Date): Promise<{ own: SelfShift[]; running: Running } | null> {
  const { data: staffId } = await ctx.supabase.rpc("my_staff_id", { p_org: ctx.org.id })
  if (!staffId) return null
  const since = new Date(now.getTime() - 24 * 3600_000).toISOString()
  const [{ data: mine }, { data: entries }] = await Promise.all([
    ctx.supabase
      .from("shift_assignments")
      .select("status, shifts!inner(id, title, starts_at, ends_at, positions(name), locations(name), events(title))")
      .eq("staff_id", staffId)
      .eq("status", "assigned")
      .gte("shifts.ends_at", new Date(now.getTime() - 2 * 3600_000).toISOString())
      .limit(20),
    ctx.supabase.from("time_entries").select("started_at, ended_at, shift_id, projects(name)").eq("staff_id", staffId).or(`ended_at.is.null,started_at.gte.${since}`),
  ])
  const entryOf = (shiftId: string) => entries?.find((e) => e.shift_id === shiftId)
  const own = (mine ?? [])
    .map(({ status, shifts: s }) => ({
      id: s.id,
      title: s.title,
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      position: s.positions?.name ?? null,
      location: s.locations?.name ?? null,
      event: s.events?.title ?? null,
      status,
      checked_in_at: entryOf(s.id)?.started_at ?? null,
      checked_out_at: entryOf(s.id)?.ended_at ?? null,
    }))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const running = entries?.find((e) => !e.ended_at)
  return { own, running: running ? { started_at: running.started_at, shift_id: running.shift_id, projects: running.projects } : null }
}

function More({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
      {label} <ChevronRightIcon className="size-4" />
    </Link>
  )
}

function Row({ href, icon, label, detail, end }: { href: string; icon?: React.ReactNode; label: string; detail?: string; end?: React.ReactNode }) {
  return (
    <li>
      <Link href={href} prefetch={href.startsWith("/notifications/") ? false : undefined} className="flex min-h-12 items-center gap-3 px-4 py-2 text-sm hover:bg-muted active:bg-muted">
        {icon}
        <span className="grid min-w-0 flex-1">
          <span className="truncate font-medium">{label}</span>
          {detail && <span className="truncate text-xs text-muted-foreground">{detail}</span>}
        </span>
        {end}
        <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
