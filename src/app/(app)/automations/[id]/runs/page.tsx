import { notFound } from "next/navigation"
import { contactName } from "@/app/(app)/contacts/fields"
import { DataTable, ListToolbar, Pager, pageRange, PAGE_SIZE } from "@/components/data-table"
import { Notice } from "@/components/notice"
import { Page, PageHeader } from "@/components/page"
import { Segments } from "@/components/segments"
import { SubmitButton } from "@/components/submit-button"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { pageParam, param, withParams } from "@/lib/url"
import { cancelRun } from "../../actions"
import { RunBadge } from "../../run-badge"

const STATUSES = ["waiting", "failed", "done", "cancelled"] as const

// Every run of a workflow (Zapier's Zap history, n8n's executions): when, who, how it went; a row opens the run
// with each step. Waiting runs can be cancelled (asks).
export default async function RunsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const ctx = await requirePerm("automations.view")
  const t = await getT()
  const sp = await searchParams
  const page = pageParam(sp)
  const status = STATUSES.find((s) => s === param(sp, "status"))
  let q = ctx.supabase
    .from("workflow_runs")
    .select("id, status, created_at, resume_at, error, log, contacts(id, first_name, last_name, company, email)")
    .eq("org_id", ctx.org.id)
    .eq("workflow_id", id)
    .order("created_at", { ascending: false })
    .range(...pageRange(page))
  if (status === "waiting") q = q.in("status", ["waiting", "queued"])
  else if (status) q = q.eq("status", status)
  const [{ data: wf }, { data: runs }] = await Promise.all([ctx.supabase.from("workflows").select("name").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(), q])
  if (!wf) notFound()
  const when = (iso: string) => t.date(iso, { dateStyle: "short", timeStyle: "short" })
  const canManage = ctx.can("automations.manage")
  const here = `/automations/${id}/runs${withParams(sp, { ok: undefined, error: undefined })}`

  return (
    <Page>
      <PageHeader crumbs={[{ href: "/automations", label: t("automations.title") }, { href: `/automations/${id}`, label: wf.name }, { label: t("automations.runs") }]} title={t("automations.runs")} />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <ListToolbar>
        <Segments
          label={t("automations.status")}
          items={[undefined, ...STATUSES].map((x) => ({ href: withParams(sp, { status: x, page: undefined }), current: status === x, label: x ? t.dynamic(`automations.runFilter.${x}`) : t("automations.all") }))}
        />
      </ListToolbar>
      <DataTable
        rows={(runs ?? []).slice(0, PAGE_SIZE)}
        rowKey={(r) => r.id}
        rowHref={(r) => `/automations/${id}/runs/${r.id}`}
        empty={t("automations.noRuns")}
        columns={[
          { header: t("automations.started"), cell: (r) => when(r.created_at) },
          { header: t("automations.person"), cell: (r) => (r.contacts ? contactName(r.contacts) : "–") },
          {
            header: t("automations.status"),
            cell: (r) => (
              <span className="flex flex-wrap items-center gap-2">
                <RunBadge t={t} status={r.status} />
                {r.status === "waiting" && r.resume_at && <span className="text-xs text-muted-foreground">{t("automations.until", { when: when(r.resume_at) })}</span>}
              </span>
            ),
          },
          { header: t("automations.steps"), cell: (r) => t("automations.stepCount", { count: (r.log as unknown[]).length }), className: "text-right tabular-nums" },
          {
            header: "",
            phone: "end",
            className: "w-0 text-right",
            cell: (r) =>
              canManage && (r.status === "waiting" || r.status === "queued") ? (
                <form action={cancelRun}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="workflow_id" value={id} />
                  <input type="hidden" name="back" value={here} />
                  <SubmitButton size="sm" variant="ghost" data-confirm="automations.confirmCancel">
                    {t("automations.cancel")}
                  </SubmitButton>
                </form>
              ) : null,
          },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(runs?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />
    </Page>
  )
}

export const instant = false
