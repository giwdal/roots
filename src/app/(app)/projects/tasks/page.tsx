import { ArchiveRestoreIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuLink } from "@/components/actions-menu"
import { DataTable } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { Page, PageHeader } from "@/components/page"
import { Segments } from "@/components/segments"
import { SubmitButton } from "@/components/submit-button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams, type SearchParams } from "@/lib/url"
import { projectBasics } from "@/projects/load"
import { restoreTaskAction } from "../actions"
import { TASK_VIEWS, TasksView } from "../tasks-view"
import { ViewSegments } from "../view-segments"

// Aufgaben: Meine (default, the person's own tasks grouped by due date) · Alle (everyone's, by status), as list, board,
// timeline or calendar. ?trash=1 lists trashed tasks to restore (?project= narrows it).
export default async function TasksPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePerm("projects.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("projects.manage")
  const trash = canManage && param(sp, "trash") === "1"
  const view = TASK_VIEWS.find((v) => v === param(sp, "view")) ?? "list"
  const who = param(sp, "assignee")
  const mine = !who || who === "me"
  const crumbs = [{ href: "/projects", label: t("projects.title") }, { href: trash ? "/projects/tasks" : undefined, label: t("projects.tasks") }, ...(trash ? [{ label: t("projects.trash") }] : [])]

  if (trash) {
    const project = param(sp, "project")
    let query = ctx.supabase.from("tasks").select("id, title, deleted_at, projects(name)").eq("org_id", ctx.org.id).not("deleted_at", "is", null).order("deleted_at", { ascending: false }).limit(500)
    if (project && /^[0-9a-f-]{36}$/.test(project)) query = query.eq("project_id", project)
    const { data: rows } = await query
    const back = `/projects/tasks${withParams(sp, { ok: undefined, error: undefined })}`
    return (
      <Page>
        <PageHeader
          crumbs={crumbs}
          title={t("projects.trash")}
          menu={
            <ActionsMenu>
              <MenuLink href="/projects/tasks" icon={<ArchiveRestoreIcon />}>
                {t("projects.backToTasks")}
              </MenuLink>
            </ActionsMenu>
          }
        />
        <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
        <p className="text-sm text-muted-foreground">{t("projects.taskTrashHint", { days: 30 })}</p>
        <DataTable
          rows={rows ?? []}
          rowKey={(r) => r.id}
          empty={t("projects.trashEmpty")}
          columns={[
            { header: t("projects.taskTitle"), cell: (r) => r.title },
            { header: t("projects.project"), cell: (r) => r.projects?.name ?? "–" },
            { header: t("projects.deletedAt"), cell: (r) => (r.deleted_at ? t.date(r.deleted_at, { dateStyle: "medium" }) : "–") },
            {
              header: "",
              cell: (r) => (
                <form action={restoreTaskAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="back" value={back} />
                  <SubmitButton size="sm" variant="outline">
                    {t("projects.restore")}
                  </SubmitButton>
                </form>
              ),
            },
          ]}
        />
      </Page>
    )
  }

  const basics = await projectBasics(ctx)
  const keep = { task: undefined, new: undefined, ok: undefined, error: undefined }
  return (
    <Page className="max-w-none">
      <PageHeader
        crumbs={crumbs.slice(0, 2)}
        title={t("projects.tasks")}
        settings={canManage && { href: "/projects/settings", label: t("common.settings") }}
        menu={
          canManage && (
            <ActionsMenu>
              <MenuLink href="/projects/tasks?trash=1" icon={<Trash2Icon />}>
                {t("projects.trash")}
              </MenuLink>
            </ActionsMenu>
          )
        }
        primary={canManage ? { href: withParams(sp, { new: "task", task: undefined }), label: t("projects.newTask") } : undefined}
      />
      <Notice error={!param(sp, "task") && !param(sp, "new") ? param(sp, "error") : undefined} ok={!param(sp, "task") ? param(sp, "ok") : undefined} />
      <TasksView
        ctx={ctx}
        t={t}
        sp={sp}
        base="/projects/tasks"
        view={view}
        mine={mine}
        basics={basics}
        segments={
          <Segments
            label={t("projects.whose")}
            items={[
              { href: withParams(sp, { ...keep, assignee: undefined, person: undefined, group: undefined }), label: t("projects.mineShort"), current: mine },
              { href: withParams(sp, { ...keep, assignee: "all", person: undefined, group: undefined }), label: t("projects.everyone"), current: !mine },
            ]}
          />
        }
        views={<ViewSegments t={t} sp={sp} views={TASK_VIEWS} current={view} />}
      />
    </Page>
  )
}

export const instant = false
