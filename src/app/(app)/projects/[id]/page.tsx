import Link from "next/link"
import { notFound } from "next/navigation"
import { BookOpenIcon, CalendarIcon, ContactIcon, FileTextIcon, FormInputIcon, GraduationCapIcon, HomeIcon, KeyRoundIcon, LinkIcon, Trash2Icon, XIcon, type LucideIcon } from "lucide-react"
import { berlinToday } from "@/api/v1/shared"
import { ActionsMenu, MenuLink, MenuSeparator, MenuSubmit } from "@/components/actions-menu"
import { ActivityFeed } from "@/components/activity-feed"
import { customDetails } from "@/components/custom-field-details"
import { customInlineItems } from "@/components/custom-field-inline"
import { DetailList } from "@/components/detail-list"
import { FileList } from "@/components/file-list"
import { InlineField } from "@/components/inline-field"
import { LinkRows } from "@/components/link-rows"
import { Notice } from "@/components/notice"
import { Page, PageHeader } from "@/components/page"
import { RichTextEditor } from "@/components/rich-text-editor"
import { Section } from "@/components/section"
import { Stat, Stats } from "@/components/stats"
import { SubmitButton } from "@/components/submit-button"
import { hoursText } from "@/components/time-entries"
import { UrlSheet } from "@/components/url-sheet"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { cn } from "@/lib/utils"
import { param, withParams, type SearchParams } from "@/lib/url"
import { DOT, PICKABLE_COLORS } from "@/projects/fields"
import { projectBasics } from "@/projects/load"
import { linkedRecords, PROJECT_COLS } from "@/projects/server"
import { minutes } from "@/shifts/time"
import { addCommentAction, deleteCommentAction, editCommentAction, patchProject, removeLinkAction, trashProjectAction } from "../actions"
import { AutosaveForm } from "../autosave-form"
import { InlineTitle } from "../inline-title"
import { LinkPicker } from "../link-picker"
import { NewTaskSheet } from "../new-task-sheet"
import { QuickAdd } from "../quick-add"
import { TaskDrawer } from "../task-drawer"
import { TASK_VIEWS, TasksView, type TaskView } from "../tasks-view"
import { ViewSegments } from "../view-segments"
import { canTrackTime, ProjectTime } from "./time-view"

const VIEWS = ["overview", ...TASK_VIEWS, "time"] as const
const KIND_ICON: Record<string, LucideIcon> = { wiki_pages: BookOpenIcon, events: CalendarIcon, contacts: ContactIcon, courses: GraduationCapIcon, rentals: KeyRoundIcon, rental_objects: HomeIcon, documents: FileTextIcon, forms: FormInputIcon }

// One project (patterns.md §8): identity (colour, name edited in the title, status, lead · period), Stats (progress,
// open, overdue, hours), one row of views. Übersicht: main = description (edits in place), the next open tasks with a
// quick add, the activity; right rail = Eigenschaften (each value incl. custom fields edited in place, patchProject), Verknüpft, Dateien.
// The other views are the project's tasks (board, list, timeline, calendar) and its time. Sheets: ?task=<id>,
// ?new=task, ?edit=links (link / unlink records).
export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const ctx = await requirePerm("projects.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("projects.manage")
  const tracksTime = canTrackTime(ctx)
  const views = tracksTime ? VIEWS : VIEWS.filter((v) => v !== "time")
  const view = views.find((v) => v === param(sp, "view")) ?? "overview"
  const base = `/projects/${id}`
  const [basics, { data: p }, defs, taskDefs, { data: links }, { data: taskRows }, { data: timeRows }] = await Promise.all([
    projectBasics(ctx),
    ctx.supabase.from("projects").select(PROJECT_COLS).eq("id", id).eq("org_id", ctx.org.id).is("deleted_at", null).maybeSingle(),
    loadFields(ctx.supabase, ctx.org.id, "projects"),
    loadFields(ctx.supabase, ctx.org.id, "tasks"),
    ctx.supabase.from("project_links").select("id, entity, entity_id").eq("project_id", id).eq("org_id", ctx.org.id).order("created_at"),
    ctx.supabase.from("tasks").select("id, title, status_id, completed_at, due_on, task_assignees(user_id)").eq("project_id", id).eq("org_id", ctx.org.id).is("deleted_at", null).limit(5000),
    tracksTime ? ctx.supabase.from("time_entries").select("id, started_at, ended_at, break_minutes").eq("org_id", ctx.org.id).eq("project_id", id).not("ended_at", "is", null).limit(5000) : Promise.resolve({ data: [] }),
  ])
  if (!p) notFound()
  const status = basics.projectStatuses.find((s) => s.id === p.status_id)
  const lead = basics.team.find((m) => m.id === p.lead_id)?.name
  const today = berlinToday()
  const all = taskRows ?? []
  const doneCount = all.filter((x) => x.completed_at).length
  const open = all.filter((x) => !x.completed_at)
  const overdue = open.filter((x) => x.due_on && x.due_on < today).length
  const hours = (timeRows ?? []).reduce((s, e) => s + minutes(e).net, 0)
  const day = (d: string) => t.date(`${d}T12:00:00`, { dateStyle: "medium" })
  const period = p.start_on || p.end_on ? [p.start_on, p.end_on].map((d) => (d ? day(d) : "…")).join(" – ") : null
  const editParam = param(sp, "edit")
  const linked = view === "overview" || editParam === "links" ? await linkedRecords(ctx.supabase, ctx.org.id, links ?? []) : []
  const here = `${base}${withParams(sp, { task: undefined, new: undefined, edit: undefined, due: undefined, start: undefined, end: undefined, ok: undefined, error: undefined })}`
  const sheetOpen = !!param(sp, "task") || !!param(sp, "new") || !!editParam

  // Eigenschaften: each value edited where it is shown (projects.manage), patchProject checks it like the form.
  const prop = (field: string, label: string, value: string | null, opts: Omit<React.ComponentProps<typeof InlineField>, "action" | "id" | "field" | "value" | "label"> = {}) => ({
    label,
    value: <InlineField action={patchProject} id={p.id} field={field} value={value} label={label} disabled={!canManage} {...opts} />,
  })
  const dot = (color: string) => <span className="size-2.5 shrink-0 rounded-full" style={{ background: DOT[color] ?? DOT.gray }} aria-hidden />
  const properties = (
    <Section id="properties" title={t("projects.properties")}>
      <DetailList
        items={[
          prop("status_id", t("projects.status"), p.status_id, { kind: "choice", options: basics.projectStatuses.map((s) => ({ value: s.id, label: s.name })), display: status?.name }),
          prop("lead_id", t("projects.lead"), p.lead_id, { kind: "choice", options: basics.team.map((m) => ({ value: m.id, label: m.name })), display: lead }),
          prop("start_on", t("projects.start"), p.start_on, { kind: "date", display: p.start_on && day(p.start_on) }),
          prop("end_on", t("projects.end"), p.end_on, { kind: "date", display: p.end_on && <span className={cn(!status?.is_done && p.end_on < today && "text-destructive")}>{day(p.end_on)}</span> }),
          prop("color", t("projects.color"), p.color, {
            kind: "choice",
            options: PICKABLE_COLORS.map((c) => ({ value: c, label: t.dynamic(`projects.colors.${c}`) })),
            display: (
              <span className="inline-flex items-center gap-2">
                {dot(p.color)} {t.dynamic(`projects.colors.${p.color}`)}
              </span>
            ),
          }),
          ...(canManage ? customInlineItems(t, defs, p.custom, patchProject, p.id) : customDetails(t, defs, p.custom)),
        ]}
      />
    </Section>
  )

  const nextTasks = [...open].sort((a, b) => (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999")).slice(0, 8)
  const statusOf = (sid: string) => basics.statuses.find((s) => s.id === sid)
  const overview = (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
      <aside className="grid min-w-0 content-start gap-6 lg:col-start-2 lg:row-start-1">{properties}</aside>
      <div className="grid min-w-0 content-start gap-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
        <Section id="description" title={t("projects.description")}>
          {canManage ? (
            <AutosaveForm action={patchProject} className="grid gap-1">
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="field" value="description" />
              <RichTextEditor name="value" defaultValue={p.description} className="[&_.ProseMirror]:min-h-24" />
            </AutosaveForm>
          ) : p.description ? (
            <RichTextEditor name="description" defaultValue={p.description} disabled className="border-transparent [&_[role=toolbar]]:hidden" />
          ) : (
            <p className="text-sm text-muted-foreground">–</p>
          )}
        </Section>
        <Section
          id="tasks"
          title={t("projects.openTasks", { count: open.length })}
          action={
            all.length > 0 && (
              <Link href={`${base}?view=list`} className="text-sm link">
                {t("projects.showAllTasks")}
              </Link>
            )
          }
        >
          {nextTasks.length > 0 ? (
            <ul className="divide-y overflow-hidden rounded-lg border">
              {nextTasks.map((x) => {
                const s = statusOf(x.status_id)
                const late = x.due_on && x.due_on < today
                return (
                  <li key={x.id}>
                    <Link href={withParams(sp, { task: x.id, new: undefined, edit: undefined })} scroll={false} className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm hover:bg-muted active:bg-muted">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: DOT[s?.color ?? "gray"] ?? DOT.gray }} title={s?.name} aria-hidden />
                      <span className="min-w-0 flex-1 truncate font-medium">{x.title}</span>
                      {x.task_assignees.length > 0 && <span className="hidden max-w-32 truncate text-xs text-muted-foreground sm:inline">{x.task_assignees.map((a) => basics.team.find((m) => m.id === a.user_id)?.name).filter(Boolean).join(", ")}</span>}
                      {x.due_on && <span className={cn("shrink-0 text-xs tabular-nums", late ? "font-medium text-destructive" : "text-muted-foreground")}>{t.date(`${x.due_on}T12:00:00`, { day: "numeric", month: "short" })}</span>}
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t(all.length ? "projects.allDone" : "projects.noTasksYet")}</p>
          )}
          {canManage && <QuickAdd projectId={p.id} />}
        </Section>
        <Section id="activity" title={t("activity.title")}>
          <ActivityFeed
            ctx={ctx}
            t={t}
            entity="projects"
            entityId={p.id}
            back={base}
            defs={defs}
            actions={{ add: addCommentAction, edit: editCommentAction, remove: deleteCommentAction }}
            upload={{ entity: "projects", entityId: p.id }}
            tasks={{
              href: (taskId) => `${base}?task=${taskId}`,
              fields: {
                title: t("projects.taskTitle"),
                status_id: t("projects.status"),
                start_on: t("projects.start"),
                due_on: t("projects.due"),
                tags: t("projects.tags"),
              },
              show: { status_id: (v) => basics.statuses.find((x) => x.id === v)?.name ?? "–" },
              defs: taskDefs,
            }}
            fields={{
              name: t("projects.name"),
              status_id: t("projects.status"),
              lead_id: t("projects.lead"),
              start_on: t("projects.start"),
              end_on: t("projects.end"),
              description: t("projects.description"),
            }}
            show={{
              status_id: (v) => basics.projectStatuses.find((s) => s.id === v)?.name ?? "–",
              lead_id: (v) => basics.team.find((m) => m.id === v)?.name ?? "–",
            }}
          />
        </Section>
      </div>
      <aside className="grid min-w-0 content-start gap-6 lg:col-start-2 lg:row-start-2">
        <Section
          id="links"
          title={t("projects.links")}
          action={
            canManage && (
              <Link href={withParams(sp, { edit: "links", task: undefined, new: undefined })} scroll={false} className="text-sm link">
                {t("projects.linkAction")}
              </Link>
            )
          }
        >
          {linked.length > 0 ? (
            <LinkRows rows={linked.map((l) => ({ key: l.id, href: l.href, icon: KIND_ICON[l.entity] ?? LinkIcon, title: l.title, detail: t.dynamic(`projects.linkKinds.${l.entity}`) }))} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("projects.linksHint")}</p>
          )}
        </Section>
        <FileList ctx={ctx} entity="projects" entityId={p.id} back={`${base}#files`} />
      </aside>
    </div>
  )

  return (
    <Page className={view === "overview" || view === "time" ? undefined : "max-w-none"}>
      <PageHeader
        crumbs={[{ href: "/projects", label: t("projects.title") }, { label: p.name }]}
        title={
          <span className="inline-flex min-w-0 items-center gap-2">
            <span className="size-3 shrink-0 rounded-full" style={{ background: DOT[p.color] ?? DOT.gray }} aria-hidden />
            <InlineTitle id={p.id} name={p.name} disabled={!canManage} />
          </span>
        }
        badge={status && <Badge variant={status.is_done ? "success" : "info"}>{status.name}</Badge>}
        meta={[lead && t("projects.leadBy", { name: lead }), period].filter(Boolean).join(" · ") || undefined}
        menu={
          canManage && (
            <ActionsMenu>
              <MenuLink href={withParams(sp, { edit: "links", task: undefined, new: undefined })} icon={<LinkIcon />}>
                {t("projects.linkAction")}
              </MenuLink>
              <MenuLink href={`/projects/tasks?trash=1&project=${p.id}`} icon={<Trash2Icon />}>
                {t("projects.trashedTasks")}
              </MenuLink>
              <MenuSeparator />
              <MenuSubmit form="trash-project" icon={<Trash2Icon />} destructive>
                {t("projects.projectToTrash")}
              </MenuSubmit>
            </ActionsMenu>
          )
        }
        primary={canManage ? { href: withParams(sp, { new: "task", task: undefined, edit: undefined }), label: t("projects.newTask") } : undefined}
      />
      {canManage && (
        <form id="trash-project" action={trashProjectAction} hidden>
          <input type="hidden" name="id" value={p.id} />
        </form>
      )}
      <Notice error={!sheetOpen ? param(sp, "error") : undefined} ok={!param(sp, "task") ? param(sp, "ok") : undefined} />
      <Stats>
        <Stat label={t("projects.progress")} value={all.length ? `${Math.round((doneCount / all.length) * 100)} %` : "–"} hint={all.length ? t("projects.tasksDone", { done: doneCount, count: all.length }) : undefined} />
        <Stat label={t("projects.open")} value={open.length} href={`${base}?view=list`} />
        <Stat label={t("projects.overdue")} value={overdue} href={overdue ? `${base}?view=list&due=overdue` : undefined} tone={overdue ? "warn" : undefined} />
        {tracksTime && <Stat label={t("projects.hours")} value={hoursText(t, hours)} href={`${base}?view=time`} />}
      </Stats>
      <ViewSegments t={t} sp={sp} views={views} current={view} />

      {view === "overview" ? (
        <>
          {overview}
          <TaskDrawer ctx={ctx} t={t} id={param(sp, "task")} back={here} basics={basics} error={param(sp, "error")} ok={param(sp, "ok")} />
          {canManage && param(sp, "new") === "task" && <NewTaskSheet t={t} back={here} project={{ id: p.id, name: p.name }} lockProject due={param(sp, "due")} me={null} team={basics.team} error={param(sp, "error")} />}
        </>
      ) : view === "time" ? (
        <ProjectTime ctx={ctx} t={t} sp={sp} base={base} projectId={p.id} />
      ) : (
        <TasksView ctx={ctx} t={t} sp={sp} base={base} view={view as TaskView} projectId={p.id} basics={basics} />
      )}

      {canManage && editParam === "links" && (
        <UrlSheet params={["edit"]} title={t("projects.links")} meta={p.name}>
          <Notice error={param(sp, "error")} />
          {linked.length > 0 && (
            <ul className="divide-y overflow-hidden rounded-lg border">
              {linked.map((l) => {
                const Icon = KIND_ICON[l.entity] ?? LinkIcon
                return (
                  <li key={l.id} className="flex min-h-11 items-center gap-3 px-3 py-1.5 text-sm">
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="grid min-w-0 flex-1">
                      <Link href={l.href} className="truncate font-medium hover:underline">
                        {l.title}
                      </Link>
                      <span className="truncate text-xs text-muted-foreground">{t.dynamic(`projects.linkKinds.${l.entity}`)}</span>
                    </span>
                    <form action={removeLinkAction}>
                      <input type="hidden" name="id" value={l.id} />
                      <input type="hidden" name="project_id" value={p.id} />
                      <SubmitButton variant="ghost" size="icon-sm" aria-label={t("projects.unlink")} data-confirm="projects.confirmUnlink">
                        <XIcon />
                      </SubmitButton>
                    </form>
                  </li>
                )
              })}
            </ul>
          )}
          <LinkPicker projectId={p.id} />
        </UrlSheet>
      )}
    </Page>
  )
}

export const instant = false
