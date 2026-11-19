import Link from "next/link"
import { ArchiveRestoreIcon, PlusIcon, Trash2Icon, WorkflowIcon } from "lucide-react"
import { ActionSwitch } from "@/components/action-switch"
import { ActionsMenu, MenuLink } from "@/components/actions-menu"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { DataTable } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { SaveBar } from "@/components/save-bar"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UrlSheet } from "@/components/url-sheet"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, withParams } from "@/lib/url"
import { parseRecordTrigger } from "@/automations/objects"
import { TEMPLATES } from "@/automations/templates"
import { createWorkflow, restoreWorkflow, setActiveAction } from "./actions"
import { RunBadge } from "./run-badge"

// Automations at a glance (Zapier / Make / n8n): each flow with its trigger, an on/off switch (switching on asks),
// its last run and failures; a row opens the canvas. New = template, blank or import; trash ?trash=1 with restore.
export default async function AutomationsPage({ searchParams }: PageProps<"/automations">) {
  const ctx = await requirePerm("automations.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("automations.manage")
  const trash = canManage && param(sp, "trash") === "1"
  let query = ctx.supabase
    .from("workflows")
    .select("id, name, active, trigger_type, updated_at, deleted_at, open:workflow_runs(count), bad:workflow_runs(count), last:workflow_runs(id, created_at, status)")
    .eq("org_id", ctx.org.id)
    .in("open.status", ["queued", "waiting"])
    .eq("bad.status", "failed")
    .order("created_at", { referencedTable: "last", ascending: false })
    .limit(1, { referencedTable: "last" })
  query = trash ? query.not("deleted_at", "is", null).order("deleted_at", { ascending: false }) : query.is("deleted_at", null).order("name")
  const { data } = await query
  const count = (x: { count: number }[] | null | undefined) => x?.[0]?.count ?? 0
  const rows = (data ?? []).map((w) => ({ ...w, waiting: count(w.open), failed: count(w.bad), lastRun: w.last?.[0] ?? null }))
  const templates = TEMPLATES.filter((x) => !x.module || ctx.modules.has(x.module))
  const when = (w: { trigger_type: string | null }) => {
    const rec = w.trigger_type ? parseRecordTrigger(w.trigger_type) : null
    return rec ? `${t.dynamic(`automations.objects.${rec.object}`)} · ${t.dynamic(`automations.recordActions.${rec.action}`)}` : w.trigger_type ? (t.has(`events.types.${w.trigger_type}`) ? t.dynamic(`events.types.${w.trigger_type}`) : t.has(`automations.${w.trigger_type}`) ? t.dynamic(`automations.${w.trigger_type}`) : w.trigger_type) : t("automations.noTrigger")
  }
  const newHref = `/automations${withParams(sp, { new: "1" })}`

  return (
    <Page>
      <PageHeader
        area="automations"
        title={trash ? t("automations.trash") : t("automations.title")}
        menu={
          canManage && (
            <ActionsMenu>
              <MenuLink href={trash ? "/automations" : "/automations?trash=1"} icon={trash ? <WorkflowIcon /> : <Trash2Icon />}>
                {trash ? t("automations.backToList") : t("automations.trash")}
              </MenuLink>
            </ActionsMenu>
          )
        }
        primary={canManage && !trash ? { href: newHref, label: t("automations.new") } : undefined}
      />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {trash && <p className="text-sm text-muted-foreground">{t("automations.trashHint", { days: 30 })}</p>}
      <DataTable
        rows={rows}
        rowKey={(w) => w.id}
        rowHref={trash ? undefined : (w) => `/automations/${w.id}`}
        empty={
          trash ? (
            <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">{t("automations.trashEmpty")}</p>
          ) : (
            <EmptyState
              area="automations"
              title={t("automations.empty")}
              text={t("automations.intro")}
              action={
                canManage && (
                  <Button render={<Link href={newHref} />} nativeButton={false} size="sm">
                    <PlusIcon /> {t("automations.new")}
                  </Button>
                )
              }
            />
          )
        }
        columns={[
          {
            header: t("automations.name"),
            cell: (w) => (
              <span className="grid min-w-0">
                <span className="truncate font-medium">{w.name}</span>
                <span className="truncate text-xs text-muted-foreground">{when(w)}</span>
              </span>
            ),
          },
          {
            header: t("automations.lastRun"),
            cell: (w) =>
              w.lastRun ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">{t.date(w.lastRun.created_at, { dateStyle: "short", timeStyle: "short" })}</span>
                  <RunBadge t={t} status={w.lastRun.status} />
                </span>
              ) : (
                <span className="text-muted-foreground">{t("automations.neverRan")}</span>
              ),
          },
          {
            header: t("automations.problems"),
            cell: (w) =>
              w.failed || w.waiting ? (
                <span className="flex flex-wrap gap-1.5">
                  {w.failed > 0 && <Badge variant="destructive">{t("automations.failedCount", { count: w.failed })}</Badge>}
                  {w.waiting > 0 && <Badge variant="warning">{t("automations.waitingCount", { count: w.waiting })}</Badge>}
                </span>
              ) : null,
          },
          trash
            ? {
                header: "",
                phone: "end",
                className: "w-0 text-right",
                cell: (w) => (
                  <form action={restoreWorkflow}>
                    <input type="hidden" name="id" value={w.id} />
                    <SubmitButton size="sm" variant="outline">
                      <ArchiveRestoreIcon /> {t("automations.restore")}
                    </SubmitButton>
                  </form>
                ),
              }
            : {
                header: t("automations.on"),
                phone: "end",
                className: "w-0 text-right",
                cell: (w) =>
                  canManage ? (
                    // The switch sits on the row link: stop the row from opening when it is tapped.
                    <span className="relative z-10 inline-flex">
                      <ActionSwitch checked={w.active} label={`${w.name}: ${t("automations.on")}`} action={setActiveAction.bind(null, w.id)} confirmOn="automations.confirmActivate" />
                    </span>
                  ) : (
                    <Badge variant={w.active ? "success" : "secondary"}>{t(w.active ? "automations.on" : "automations.off")}</Badge>
                  ),
              },
        ]}
      />
      {canManage && !trash && param(sp, "new") && (
        <UrlSheet params={["new"]} title={t("automations.new")}>
          <Notice error={param(sp, "error")} />
          <div className="grid gap-6">
            <section className="grid gap-2">
              <h2 className="text-sm font-medium">{t("automations.fromTemplate")}</h2>
              <ul className="divide-y rounded-xl border">
                {templates.map((tpl) => (
                  <li key={tpl.key}>
                    <form action={createWorkflow} className="flex items-center justify-between gap-3 px-4 py-3">
                      <input type="hidden" name="template" value={tpl.key} />
                      <span className="grid text-sm">
                        <span className="font-medium">{t.dynamic(`automations.templates.${tpl.key}.name`)}</span>
                        <span className="text-xs text-muted-foreground">{t.dynamic(`automations.templates.${tpl.key}.text`)}</span>
                      </span>
                      <SubmitButton size="sm" variant="outline">
                        {t("automations.use")}
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
            <form action={createWorkflow} className="grid gap-2">
              <h2 className="text-sm font-medium">{t("automations.import")}</h2>
              <p className="text-xs text-muted-foreground">{t("automations.importHint")}</p>
              <Label htmlFor="wf-file" className="sr-only">
                {t("automations.importFile")}
              </Label>
              <div className="flex flex-wrap gap-2">
                <Input id="wf-file" name="file" type="file" accept="application/json,.json" required className="min-w-0 flex-1" />
                <SubmitButton variant="outline">{t("automations.importButton")}</SubmitButton>
              </div>
            </form>
            <form action={createWorkflow} className="grid gap-2">
              <h2 className="text-sm font-medium">{t("automations.blank")}</h2>
              <Label htmlFor="wf-name" className="sr-only">
                {t("automations.name")}
              </Label>
              <Input id="wf-name" name="name" maxLength={200} placeholder={t("automations.namePlaceholder")} />
              <SaveBar label={t("automations.create")} always />
            </form>
          </div>
        </UrlSheet>
      )}
    </Page>
  )
}

export const instant = false
