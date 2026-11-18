import { Notice } from "@/components/notice"
import { Page, PageHeader } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { Section } from "@/components/section"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, type SearchParams } from "@/lib/url"
import { saveColumnsAction } from "../actions"
import { ColumnRows } from "./column-rows"

// Projekte › Einstellungen (gear): the columns of both boards (tasks, projects) as inline rows in one form, one SaveBar.
export default async function ProjectsSettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePerm("projects.manage")
  const t = await getT()
  const sp = await searchParams
  const { data } = await ctx.supabase.from("task_statuses").select("id, name, color, is_done, scope").eq("org_id", ctx.org.id).order("position")
  const rows = (scope: string) => (data ?? []).filter((x) => x.scope === scope).map((x) => ({ id: x.id, name: x.name, color: x.color, is_done: x.is_done }))
  return (
    <Page size="form">
      <PageHeader crumbs={[{ href: "/projects", label: t("projects.title") }, { label: t("common.settings") }]} title={t("common.settings")} />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <form action={saveColumnsAction} className="grid gap-6">
        <Section id="columns" title={t("projects.columns")} description={t("projects.setupHint")}>
          <ColumnRows scope="task" initial={rows("task")} />
        </Section>
        <Section id="project-columns" title={t("projects.projectColumns")} description={t("projects.projectSetupHint")}>
          <ColumnRows scope="project" initial={rows("project")} />
        </Section>
        <SaveBar />
      </form>
    </Page>
  )
}

export const instant = false
