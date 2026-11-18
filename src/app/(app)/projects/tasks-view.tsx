import Link from "next/link"
import { ArrowRightIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { berlinToday } from "@/api/v1/shared"
import { BulkBar } from "@/components/bulk-bar"
import { CalendarView } from "@/components/calendar-view"
import { DataTable, ListToolbar, SearchBox } from "@/components/data-table"
import { FilterMenu } from "@/components/filter-menu"
import { EmptyState } from "@/components/page"
import { SubmitButton } from "@/components/submit-button"
import { Timeline } from "@/components/timeline"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import type { T } from "@/i18n/translate"
import type { getContext } from "@/lib/context"
import { param, withParams, type SearchParams } from "@/lib/url"
import { DOT, progress, type ChecklistItem } from "@/projects/fields"
import { initials, projectBasics } from "@/projects/load"
import { TASK_COLS } from "@/projects/server"
import { bulkTasks, moveTaskDue, moveTaskDates } from "./actions"
import { Board } from "./board"
import { QuickAdd } from "./quick-add"
import { TaskDrawer } from "./task-drawer"
import { NewTaskSheet } from "./new-task-sheet"

type Ctx = Awaited<ReturnType<typeof getContext>>
export const TASK_VIEWS = ["list", "board", "timeline", "calendar"] as const
export type TaskView = (typeof TASK_VIEWS)[number]
const DUES = ["overdue", "week", "none"] as const
const GROUPS = ["status", "due"] as const
const BUCKETS = ["overdue", "today", "week", "later", "none"] as const

/**
 * Tasks as list, board, timeline or calendar, filtered by search, assignee, due date, tag and (on Aufgaben) project –
 * all in the URL. `projectId` = only that project's tasks (the project page); new tasks land there. `mine` = only the
 * signed-in person's tasks (Aufgaben › Meine): quick adds are assigned to them, the list groups by due date.
 * The list groups by status or due date (?group=), has a quick add row on top and the bulk bar (desktop).
 * ?task=<id> opens the task panel, ?new=task the create sheet (?due= pre-fills, e.g. from a calendar day).
 */
export async function TasksView({
  ctx,
  t,
  sp,
  base,
  view,
  projectId,
  mine,
  basics,
  segments,
  views,
}: {
  ctx: Ctx
  t: T
  sp: SearchParams
  base: string
  view: TaskView
  projectId?: string
  mine?: boolean
  basics: Awaited<ReturnType<typeof projectBasics>>
  segments?: React.ReactNode // left of the search (Meine · Alle)
  views?: React.ReactNode // right end of the toolbar (view switch)
}) {
  const canManage = ctx.can("projects.manage")
  const tag = param(sp, "tag")
  // The person filter (?person=, older links ?assignee=<id>); "Meine" is the `mine` view, not a filter value.
  const who = param(sp, "person") ?? param(sp, "assignee")
  const due = DUES.find((d) => d === param(sp, "due"))
  const inProject = projectId ?? (param(sp, "project") === "none" ? "none" : basics.projects.find((p) => p.id === param(sp, "project"))?.id)
  const q = param(sp, "q")?.replace(/[%,()*\\]/g, " ").trim()
  const today = berlinToday()
  const plus = (n: number) => new Date(Date.parse(`${today}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
  const week = plus(7)
  const assignee = mine ? ctx.userId : who && /^[0-9a-f-]{36}$/.test(who) ? who : null
  const group = GROUPS.find((g) => g === param(sp, "group")) ?? (mine ? "due" : "status")
  const openId = param(sp, "task")
  const filtered = !!(q || tag || due || (!mine && assignee) || (!projectId && inProject))

  let query = ctx.supabase.from("tasks").select((assignee ? TASK_COLS.replace("task_assignees(user_id)", "task_assignees!inner(user_id)") : TASK_COLS) as typeof TASK_COLS).eq("org_id", ctx.org.id).is("deleted_at", null).order("position").limit(1000)
  if (assignee) query = query.eq("task_assignees.user_id", assignee)
  if (inProject === "none") query = query.is("project_id", null)
  else if (inProject) query = query.eq("project_id", inProject)
  if (tag) query = query.contains("tags", [tag])
  if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`)
  if (due === "overdue") query = query.lt("due_on", today).is("completed_at", null)
  if (due === "week") query = query.gte("due_on", today).lte("due_on", week)
  if (due === "none") query = query.is("due_on", null)
  const { data: rows } = await query
  const { statuses, team, tags, projects } = basics
  const nameOf = (id: string) => team.find((p) => p.id === id)?.name ?? "?"
  const projectOf = (id: string | null) => projects.find((p) => p.id === id)
  const done = new Set(statuses.filter((s) => s.is_done).map((s) => s.id))
  const colorOf = (statusId: string) => DOT[statuses.find((st) => st.id === statusId)?.color ?? "gray"] ?? DOT.gray
  // With an assignee filter the joined assignees are only that one: the card still shows the filtered person.
  const tasks = (rows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    snippet: r.description.replace(/[#*_`>[\]()|~-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200),
    status_id: r.status_id,
    tags: r.tags,
    start_on: r.start_on,
    due_on: r.due_on,
    done: done.has(r.status_id),
    progress: progress((Array.isArray(r.checklist) ? r.checklist : []) as ChecklistItem[]),
    people: r.task_assignees.map((a) => ({ id: a.user_id, name: nameOf(a.user_id), initials: initials(nameOf(a.user_id)) })),
    label: projectId ? undefined : projectOf(r.project_id)?.name,
    project: projectOf(r.project_id),
    href: `${base}${withParams(sp, { task: r.id, new: undefined, due: undefined, start: undefined, end: undefined })}`,
  }))
  type Task = (typeof tasks)[number]
  const here = `${base}${withParams(sp, { task: undefined, new: undefined, due: undefined, start: undefined, end: undefined, error: undefined, ok: undefined })}`
  const newHref = withParams(sp, { new: "task", task: undefined })

  // Due buckets like Things / Todoist: overdue, today, this week, later, no date (done tasks by their date too).
  const bucket = (x: Task) => (!x.due_on ? "none" : x.due_on < today ? (x.done ? "week" : "overdue") : x.due_on === today ? "today" : x.due_on <= week ? "week" : "later")
  const groups =
    group === "status"
      ? statuses.map((s) => ({ key: s.id, title: s.name, color: DOT[s.color] ?? DOT.gray, rows: tasks.filter((x) => x.status_id === s.id) }))
      : BUCKETS.map((b) => ({ key: b, title: t.dynamic(`projects.buckets.${b}`), color: undefined, rows: tasks.filter((x) => bucket(x) === b).sort((a, c) => (a.due_on ?? "").localeCompare(c.due_on ?? "")) }))

  const columns = [
    {
      header: t("projects.taskTitle"),
      cell: (r: Task) => (
        <span className="grid gap-0.5">
          <span className={r.done ? "text-muted-foreground line-through" : "font-medium"}>{r.title}</span>
          {(r.snippet || (!projectId && r.project)) && <span className="line-clamp-1 max-w-md text-xs break-words text-muted-foreground">{[!projectId && r.project?.name, r.snippet].filter(Boolean).join(" · ")}</span>}
        </span>
      ),
    },
    {
      header: t("projects.status"),
      cell: (r: Task) => (
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: colorOf(r.status_id) }} aria-hidden /> {statuses.find((x) => x.id === r.status_id)?.name}
        </span>
      ),
    },
    { header: t("projects.due"), cell: (r: Task) => (r.due_on ? <span className={!r.done && r.due_on < today ? "text-destructive" : ""}>{t.date(`${r.due_on}T12:00:00`, { weekday: "short", day: "numeric", month: "short" })}</span> : "–") },
    { header: t("projects.assignees"), cell: (r: Task) => r.people.map((p) => p.name).join(", ") || "–" },
    { header: t("projects.tags"), cell: (r: Task) => (r.tags.length ? <span className="flex flex-wrap gap-1">{r.tags.map((x) => <Badge key={x} variant="outline">{x}</Badge>)}</span> : "–") },
    { header: t("projects.checklist"), cell: (r: Task) => r.progress ?? "–" },
  ]

  const empty = (
    <EmptyState
      area="projects"
      title={t(filtered ? "projects.empty" : mine ? "projects.emptyMine" : "projects.emptyTasks")}
      text={filtered ? undefined : t(mine ? "projects.emptyMineText" : "projects.emptyTasksText")}
      action={
        mine && !filtered ? (
          <Button variant="outline" render={<Link href={`${base}?assignee=all`} />} nativeButton={false}>
            {t("projects.showAll")}
          </Button>
        ) : (
          canManage && (
            <Button render={<Link href={newHref} scroll={false} />} nativeButton={false}>
              <PlusIcon /> {t("projects.newTask")}
            </Button>
          )
        )
      }
    />
  )

  return (
    <>
      <ListToolbar search={<SearchBox q={q} label={t("projects.search")} />}>
        {segments}
        {!mine && <FilterMenu param="person" label={t("projects.assignee")} allLabel={t("projects.everyone")} options={team.map((p) => ({ value: p.id, label: p.name }))} />}
        <FilterMenu param="due" label={t("projects.due")} allLabel={t("projects.anyDue")} options={DUES.map((d) => ({ value: d, label: t.dynamic(`projects.dues.${d}`) }))} />
        {!projectId && projects.length > 0 && (
          <FilterMenu param="project" label={t("projects.project")} allLabel={t("projects.allProjects")} options={[{ value: "none", label: t("projects.noProject") }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} />
        )}
        {tags.length > 0 && <FilterMenu param="tag" label={t("projects.tags")} allLabel={t("projects.allTags")} options={tags.map((x) => ({ value: x, label: x }))} />}
        {view === "list" && (
          <FilterMenu param="group" label={t("projects.groupBy")} allLabel={t.dynamic(`projects.groups.${mine ? "due" : "status"}`)} options={GROUPS.filter((g) => g !== (mine ? "due" : "status")).map((g) => ({ value: g, label: t.dynamic(`projects.groups.${g}`) }))} />
        )}
        {views && <div className="md:ml-auto">{views}</div>}
      </ListToolbar>

      {view === "board" ? (
        <Board statuses={statuses} tasks={tasks} canManage={canManage} back={here} today={today} projectId={projectId} mine={mine} />
      ) : view === "timeline" ? (
        <Timeline
          t={t}
          today={today}
          empty={t("projects.empty")}
          onMove={canManage ? moveTaskDates : undefined}
          items={tasks.map((x) => ({ id: x.id, title: x.title, start: x.start_on, end: x.due_on, color: colorOf(x.status_id), href: x.href, done: x.done, group: projectId ? undefined : (x.project?.name ?? t("projects.noProject")) }))}
        />
      ) : view === "calendar" ? (
        // Tasks with a due date as all-day entries in their column's colour; click opens the task panel, an empty day
        // creates a task due that day.
        <CalendarView
          viewParam="cal"
          onMove={canManage ? moveTaskDue : undefined}
          views={["month", "week", "agenda"]}
          defaultView="month"
          newHref={canManage ? withParams(sp, { new: "task", task: undefined }) : undefined}
          events={tasks
            .filter((x) => x.due_on)
            .map((x) => ({ id: x.id, title: x.done ? `✓ ${x.title}` : x.title, start: `${x.due_on}T00:00:00`, end: `${x.due_on}T23:59:00`, allDay: true, color: colorOf(x.status_id), href: x.href, readOnly: !canManage }))}
        />
      ) : (
        <div className="grid gap-6">
          {canManage && <QuickAdd projectId={projectId} mine={mine} />}
          {!tasks.length
            ? empty
            : groups
                .filter((g) => g.rows.length)
                .map((g) => (
                  <section key={g.key} aria-labelledby={`grp-${g.key}`} className="grid gap-2">
                    <h2 id={`grp-${g.key}`} className="flex items-center gap-2 px-1 text-sm font-medium">
                      {g.color && <span className="size-2.5 rounded-full" style={{ background: g.color }} aria-hidden />}
                      <span className={g.key === "overdue" ? "text-destructive" : undefined}>{g.title}</span>
                      <span className="text-xs font-normal text-muted-foreground tabular-nums">{g.rows.length}</span>
                    </h2>
                    <DataTable rows={g.rows} rowKey={(r) => r.id} rowHref={(r) => r.href} select={canManage ? { form: "bulk-tasks", label: t("common.select") } : undefined} empty={t("projects.empty")} columns={group === "status" ? columns.filter((c) => c.header !== t("projects.status")) : columns} />
                  </section>
                ))}
        </div>
      )}

      {canManage && view === "list" && (
        <BulkBar form="bulk-tasks" action={bulkTasks}>
          <input type="hidden" name="back" value={here} />
          <NativeSelect name="status_id" aria-label={t("projects.status")} defaultValue={statuses[0]?.id} className="w-40">
            {statuses.map((x) => (
              <NativeSelectOption key={x.id} value={x.id}>
                {x.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <SubmitButton size="sm" variant="outline" name="intent" value="move">
            <ArrowRightIcon /> {t("projects.moveTo")}
          </SubmitButton>
          <SubmitButton size="sm" variant="ghost" name="intent" value="trash" data-confirm="common.confirmTrashMany" className="text-destructive hover:text-destructive">
            <Trash2Icon /> {t("common.toTrash")}
          </SubmitButton>
        </BulkBar>
      )}
      <TaskDrawer ctx={ctx} t={t} id={openId} back={here} basics={basics} error={param(sp, "error")} ok={param(sp, "ok")} />
      {canManage && param(sp, "new") === "task" && (
        <NewTaskSheet
          t={t}
          back={here}
          project={projectId ? (projects.find((p) => p.id === projectId) ?? null) : null}
          lockProject={!!projectId}
          due={dayParam(param(sp, "due")) ?? dayParam(param(sp, "start")?.slice(0, 10))}
          me={mine ? { id: ctx.userId, name: nameOf(ctx.userId) } : null}
          team={team}
          error={param(sp, "error")}
        />
      )}
    </>
  )
}

const dayParam = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)
