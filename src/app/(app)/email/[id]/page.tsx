import Link from "next/link"
import { notFound } from "next/navigation"
import { CalendarXIcon, ListIcon, SendIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuSeparator, MenuSubmit } from "@/components/actions-menu"
import { Notice } from "@/components/notice"
import { PageHeader } from "@/components/page"
import { Stat, Stats } from "@/components/stats"
import { SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import { resolveAudience, type Audience } from "@/email/server"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param } from "@/lib/url"
import { trashCampaign, unscheduleCampaign } from "../actions"
import { CampaignBadge } from "../badges"
import { CampaignForm } from "../campaign-form"

// A campaign opens on its state: drafts on the editor with "Jetzt senden" as the next step (asks first, naming the
// recipient count), sent ones on their numbers with the way to every single mail (Versand, filtered).
export default async function CampaignPage({ params, searchParams }: PageProps<"/email/[id]">) {
  const { id } = await params
  const sp = await searchParams
  const ctx = await requirePerm("email.view")
  const t = await getT()
  const canManage = ctx.can("email.manage")
  const { data: c } = await ctx.supabase.from("email_campaigns").select("*").eq("id", id).eq("org_id", ctx.org.id).is("deleted_at", null).maybeSingle()
  if (!c) notFound()
  const audience = c.audience as Audience
  const editable = canManage && (c.status === "draft" || c.status === "scheduled")
  const tickets = ctx.modules.has("tickets")
  const [reach, stats, { data: tagRows }, { data: ev }] = await Promise.all([
    editable && (audience.tags?.length || audience.members || audience.event) ? resolveAudience(ctx.supabase, ctx.org.id, audience).then((r) => r.length) : Promise.resolve(null),
    !editable
      ? ctx.supabase.from("email_sends").select("status, delivery").eq("campaign_id", id).limit(50000).then(({ data }) => data ?? [])
      : Promise.resolve([] as { status: string; delivery: string | null }[]),
    ctx.supabase.rpc("contact_tags", { p_org: ctx.org.id }),
    audience.event ? ctx.supabase.from("events").select("id, title, starts_at").eq("id", audience.event).eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const count = (...s: string[]) => stats.filter((x) => s.includes(x.status)).length
  const delivered = (...d: string[]) => stats.filter((x) => d.includes(x.delivery ?? "")).length
  const tracked = stats.some((x) => x.delivery)
  const log = `/email/log?campaign=${c.id}`
  const problems = count("failed") + delivered("bounced", "complained")

  const sendNow = editable && (
    <SubmitButton size="sm" form="campaign" name="intent" value="send" data-confirm="email.confirmSend" data-confirm-count={reach ?? 0}>
      <SendIcon /> {t("email.sendNow")}
    </SubmitButton>
  )

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/email", label: t("nav.emails") }, { label: c.name }]}
        title={c.name}
        badge={<CampaignBadge t={t} status={c.status} sendAt={c.send_at} />}
        meta={
          c.status === "scheduled" && c.send_at
            ? t("email.scheduledFor", { date: t.date(c.send_at, { dateStyle: "full", timeStyle: "short" }) })
            : c.status === "draft"
              ? t("email.lastSaved", { date: t.date(c.updated_at, { dateStyle: "medium", timeStyle: "short" }) })
              : t("email.sentTo", { count: c.recipients })
        }
        actions={
          !editable && (
            <Button render={<Link href={log} />} nativeButton={false} size="sm" variant="outline">
              <ListIcon /> {t("email.viewLog")}
            </Button>
          )
        }
        menu={
          canManage &&
          c.status !== "sending" && (
            <ActionsMenu>
              {c.status === "scheduled" && (
                <>
                  <MenuSubmit form="unschedule" icon={<CalendarXIcon />}>
                    {t("email.unschedule")}
                  </MenuSubmit>
                  <MenuSeparator />
                </>
              )}
              <MenuSubmit form="trash-campaign" icon={<Trash2Icon />} destructive>
                {t("email.toTrash")}
              </MenuSubmit>
            </ActionsMenu>
          )
        }
        primary={sendNow || undefined}
      />
      {canManage && (
        <>
          <form id="unschedule" action={unscheduleCampaign} hidden>
            <input type="hidden" name="id" value={c.id} />
          </form>
          <form id="trash-campaign" action={trashCampaign} hidden>
            <input type="hidden" name="id" value={c.id} />
          </form>
        </>
      )}
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      {!editable && (c.status === "sending" || c.status === "sent") && (
        <Stats>
          <Stat label={t("email.recipients")} value={c.recipients} href={log} />
          <Stat
            label={t("email.statsSent")}
            value={count("sent")}
            hint={count("queued", "sending") ? t("email.statsQueued", { count: count("queued", "sending") }) : count("skipped") ? t("email.statsSkipped", { count: count("skipped") }) : undefined}
            href={log}
          />
          {tracked && <Stat label={t("email.statsDelivered")} value={delivered("delivered")} href={log} tone="good" />}
          <Stat
            label={t("email.statsProblems")}
            value={problems}
            hint={problems ? t("email.statsProblemsHint", { failed: count("failed"), bounced: delivered("bounced"), complained: delivered("complained") }) : undefined}
            href={log}
            tone={problems ? "warn" : undefined}
          />
        </Stats>
      )}
      <CampaignForm
        t={t}
        c={{ ...c, audience }}
        editable={editable}
        tags={(tagRows ?? []) as unknown as string[]}
        members={ctx.modules.has("members")}
        event={{ on: tickets || !!ev, initial: ev ? { id: ev.id, label: ev.title, detail: t.date(ev.starts_at, { dateStyle: "medium" }) } : null }}
        reach={reach}
      />
    </>
  )
}

export const instant = false
