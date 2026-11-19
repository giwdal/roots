import Link from "next/link"
import { ChevronRightIcon, HouseIcon, InboxIcon } from "lucide-react"
import { AreaIcon } from "@/components/area-icon"
import { Notice } from "@/components/notice"
import { Page, PageHeader } from "@/components/page"
import { Section } from "@/components/section"
import { SproutAsk } from "@/components/sprout/ask"
import { SproutOrb } from "@/components/sprout/sprout-orb"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { titled } from "@/lib/title"
import { APP_HOME, param } from "@/lib/url"
import { NAV } from "@/modules/nav"
import type { SelfShift } from "@/shifts/server"
import { NowCard, type Running } from "./shifts/now-card"
import { TaskDrawer } from "./projects/task-drawer"

export const generateMetadata = titled("shell.home")

const none = Promise.resolve({ data: null, count: null })
const area = (key: string) => NAV.find((a) => a.key === key)!

// Start, per person, kept quiet on purpose (user, 19 Nov): Sprout in the middle as the way to ask or do anything, the
// Jetzt card for people on the shift team, and "Wartet auf dich" (counts that open the filtered list, only modules
// that are on and permitted, hidden at 0). Lists of events, shifts, tasks and notifications live in their areas.
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

  const [tasks, shifts, dues, invoices, orders, submissions, hours, { count: unread }, { data: me }] = await Promise.all([
    on("projects", "projects.view")
      ? ctx.supabase.from("tasks").select("id, task_assignees!inner(user_id)", head).eq("org_id", org).eq("task_assignees.user_id", ctx.userId).is("completed_at", null).is("deleted_at", null).lte("due_on", today)
      : none,
    on("shifts", "shifts.self") ? myShifts(ctx, now) : Promise.resolve(null),
    on("members", "members.manage") ? ctx.supabase.from("member_dues").select("id", head).eq("org_id", org).eq("status", "open").lt("due_on", today) : none,
    on("invoices", "invoices.view") ? ctx.supabase.from("documents").select("id", head).eq("org_id", org).eq("kind", "invoice").eq("status", "sent").lt("due_date", today) : none,
    on("shop", "shop.manage") ? ctx.supabase.from("shop_orders").select("id", head).eq("org_id", org).not("placed_at", "is", null).in("status", ["new", "ready"]) : none,
    on("forms", "forms.view") ? ctx.supabase.from("form_submissions").select("id", head).eq("org_id", org).eq("status", "new") : none,
    on("shifts", "shifts.approve") ? ctx.supabase.from("time_entries").select("id", head).eq("org_id", org).is("approved_at", null).not("ended_at", "is", null) : none,
    ctx.supabase.from("notifications").select("id", head).eq("user_id", ctx.userId).is("read_at", null),
    ctx.supabase.from("profiles").select("full_name").eq("id", ctx.userId).maybeSingle(),
  ])

  // Things waiting for this person, each a count that opens the list already filtered to them.
  const waiting = [
    { key: "tasks", area: "projects", count: tasks.count ?? 0, label: t("home.waiting.tasks", { count: tasks.count ?? 0 }), href: "/projects/tasks" },
    { key: "hours", area: "shifts", count: hours.count ?? 0, label: t("home.waiting.hours", { count: hours.count ?? 0 }), href: "/shifts/hours" },
    { key: "submissions", area: "communication", count: submissions.count ?? 0, label: t("home.waiting.submissions", { count: submissions.count ?? 0 }), href: "/forms" },
    { key: "orders", area: "shop", count: orders.count ?? 0, label: t("home.waiting.orders", { count: orders.count ?? 0 }), href: "/shop/orders" },
    { key: "invoices", area: "finance", count: invoices.count ?? 0, label: t("home.waiting.invoices", { count: invoices.count ?? 0 }), href: "/invoices?status=overdue", warn: true },
    { key: "dues", area: "members", count: dues.count ?? 0, label: t("home.waiting.dues", { count: dues.count ?? 0 }), href: "/members/dues?status=overdue", warn: true },
  ].filter((w) => w.count > 0)
  const first = me?.full_name?.split(" ")[0]

  return (
    <Page size="form">
      <PageHeader icon={HouseIcon} title={t("shell.home")} />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {/* Sprout in the middle: the greeting, then one field to ask or get something done. */}
      <section aria-labelledby="home-hi" className="grid justify-items-center gap-4 pt-4 text-center md:pt-10">
        <SproutOrb size={44} still className="text-foreground" label="Sprout" />
        <div className="grid gap-1">
          <h2 id="home-hi" className="text-xl font-semibold tracking-tight">
            {first ? t("home.hello", { name: first }) : t("home.helloPlain")}
          </h2>
          <p className="text-sm text-muted-foreground">{t.date(now.toISOString(), { dateStyle: "full" })} · {ctx.org.name}</p>
        </div>
        <div className="w-full text-left">
          <SproutAsk />
        </div>
      </section>

      {shifts && <NowCard own={shifts.own} running={shifts.running} returnTo="/" withProjects={ctx.modules.has("projects") && ctx.can("projects.view")} />}

      <Section id="waiting" title={t("home.waitingTitle")}>
        {waiting.length || unread ? (
          <ul className="divide-y rounded-xl border">
            {waiting.map((w) => (
              <Row key={w.key} href={w.href} icon={<AreaIcon area={w.area} icon={area(w.area).icon} className="size-7" />} label={w.warn ? <span className="text-destructive">{w.label}</span> : w.label} />
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
              />
            )}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("home.allClear")}</p>
        )}
      </Section>
      <TaskDrawer ctx={ctx} t={t} id={param(sp, "task")} back={APP_HOME} error={param(sp, "error")} ok={param(sp, "ok")} />
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

function Row({ href, icon, label, detail, end }: { href: string; icon?: React.ReactNode; label: React.ReactNode; detail?: string; end?: React.ReactNode }) {
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
