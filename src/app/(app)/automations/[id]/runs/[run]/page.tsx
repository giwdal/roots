import Link from "next/link"
import { notFound } from "next/navigation"
import { CheckIcon, XIcon } from "lucide-react"
import { contactName } from "@/app/(app)/contacts/fields"
import { DetailList } from "@/components/detail-list"
import { Notice } from "@/components/notice"
import { Page, PageHeader } from "@/components/page"
import { Section } from "@/components/section"
import { SubmitButton } from "@/components/submit-button"
import { Graph } from "@/automations/graph"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { cn } from "@/lib/utils"
import { param } from "@/lib/url"
import { cancelRun } from "../../../actions"
import { RunBadge } from "../../../run-badge"

type LogEntry = { at: string; node: string; type: string; ok: boolean; note?: string }

// One run, step by step (n8n's execution view as a list): when, who, where it stands, then every step it took with
// its result; the step's own name from the canvas when it has one. A waiting run can be cancelled (asks).
export default async function RunPage({ params, searchParams }: PageProps<"/automations/[id]/runs/[run]">) {
  const { id, run: runId } = await params
  if (!/^[0-9a-f-]{36}$/.test(id) || !/^[0-9a-f-]{36}$/.test(runId)) notFound()
  const ctx = await requirePerm("automations.view")
  const t = await getT()
  const sp = await searchParams
  const [{ data: wf }, { data: run }] = await Promise.all([
    ctx.supabase.from("workflows").select("name, graph").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("workflow_runs").select("id, status, created_at, resume_at, error, log, contacts(id, first_name, last_name, company, email)").eq("id", runId).eq("workflow_id", id).eq("org_id", ctx.org.id).maybeSingle(),
  ])
  if (!wf || !run) notFound()
  const graph = Graph.safeParse(wf.graph)
  const nodeLabel = (nodeId: string) => {
    const n = graph.success ? graph.data.nodes.find((x) => x.id === nodeId) : undefined
    const own = n && typeof (n.data as { label?: unknown }).label === "string" ? String((n.data as { label: string }).label) : ""
    return own || null
  }
  const when = (iso: string) => t.date(iso, { dateStyle: "medium", timeStyle: "medium" })
  const log = (run.log as LogEntry[]) ?? []
  const waiting = run.status === "waiting" || run.status === "queued"

  return (
    <Page size="form">
      <PageHeader
        crumbs={[{ href: "/automations", label: t("automations.title") }, { href: `/automations/${id}`, label: wf.name }, { href: `/automations/${id}/runs`, label: t("automations.runs") }, { label: t.date(run.created_at, { dateStyle: "short", timeStyle: "short" }) }]}
        title={t("automations.runOf", { when: t.date(run.created_at, { dateStyle: "medium", timeStyle: "short" }) })}
        badge={<RunBadge t={t} status={run.status} />}
        meta={run.contacts ? contactName(run.contacts) : undefined}
        primary={
          waiting &&
          ctx.can("automations.manage") && (
            <form action={cancelRun}>
              <input type="hidden" name="id" value={run.id} />
              <input type="hidden" name="workflow_id" value={id} />
              <input type="hidden" name="back" value={`/automations/${id}/runs/${run.id}`} />
              <SubmitButton size="sm" variant="outline" data-confirm="automations.confirmCancel">
                {t("automations.cancel")}
              </SubmitButton>
            </form>
          )
        }
      />
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <DetailList
        items={[
          { label: t("automations.started"), value: when(run.created_at) },
          {
            label: t("automations.person"),
            value: run.contacts ? (
              <Link href={`/contacts/${run.contacts.id}`} className="link">
                {contactName(run.contacts)}
              </Link>
            ) : (
              "–"
            ),
          },
          run.status === "waiting" && run.resume_at && { label: t("automations.waitsUntil"), value: when(run.resume_at) },
          run.error && { label: t("automations.error"), value: <span className="text-destructive">{run.error}</span> },
        ]}
      />
      <Section id="steps" title={t("automations.steps")}>
        {log.length ? (
          <ol className="grid">
            {log.map((l, i) => (
              <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                {/* The line between the steps. */}
                {i < log.length - 1 && <span className="absolute top-7 bottom-0 left-3 w-px bg-border" aria-hidden />}
                <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", l.ok ? "bg-[var(--success)]/12 text-[var(--success)]" : "bg-destructive/10 text-destructive")} aria-label={l.ok ? t("automations.stepOk") : t("automations.stepFailed")}>
                  {l.ok ? <CheckIcon className="size-3.5" /> : <XIcon className="size-3.5" />}
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5 text-sm">
                  <span className="font-medium">
                    {nodeLabel(l.node) ?? t.dynamic(`automations.nodes.${l.type}`)}
                    {nodeLabel(l.node) && <span className="font-normal text-muted-foreground"> · {t.dynamic(`automations.nodes.${l.type}`)}</span>}
                  </span>
                  {l.note && <span className={cn("text-xs break-words", l.ok ? "text-muted-foreground" : "text-destructive")}>{l.note}</span>}
                  <span className="text-xs text-muted-foreground tabular-nums">{when(l.at)}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">{t("automations.noSteps")}</p>
        )}
      </Section>
    </Page>
  )
}

export const instant = false
