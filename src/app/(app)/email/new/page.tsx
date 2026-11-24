import { notFound } from "next/navigation"
import { Notice } from "@/components/notice"
import { Page, PageHeader } from "@/components/page"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param } from "@/lib/url"
import { CampaignForm } from "../campaign-form"

// "+ Neue Kampagne": the campaign editor, nothing stored yet; "Kampagne anlegen" creates it and opens its page, where
// test, planning and sending follow. ?event=<id> (from an event's "Kampagne an Käufer") starts with that event's buyers.
export default async function NewCampaignPage({ searchParams }: PageProps<"/email/new">) {
  const ctx = await requirePerm("email.manage")
  if (!ctx.modules.has("email")) notFound()
  const t = await getT()
  const sp = await searchParams
  const eventId = /^[0-9a-f-]{36}$/.test(param(sp, "event") ?? "") ? param(sp, "event")! : null
  const tickets = ctx.modules.has("tickets")
  const [{ data: tagRows }, { data: ev }] = await Promise.all([
    ctx.supabase.rpc("contact_tags", { p_org: ctx.org.id }),
    eventId && tickets ? ctx.supabase.from("events").select("id, title, starts_at").eq("id", eventId).eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const title = t("email.newCampaign")
  return (
    <Page size="record">
      <PageHeader crumbs={[{ href: "/email", label: t("nav.emails") }, { label: title }]} title={title} />
      <Notice error={param(sp, "error")} />
      <CampaignForm
        t={t}
        c={{ id: null, name: ev ? t("email.buyersName", { event: ev.title }) : "", subject: "", body: "", format: "rich", audience: { event: ev?.id ?? null }, send_at: null }}
        editable
        tags={(tagRows ?? []) as unknown as string[]}
        members={ctx.modules.has("members")}
        event={{ on: tickets, initial: ev ? { id: ev.id, label: ev.title, detail: t.date(ev.starts_at, { dateStyle: "medium" }) } : null }}
        reach={null}
      />
    </Page>
  )
}

export const instant = false
