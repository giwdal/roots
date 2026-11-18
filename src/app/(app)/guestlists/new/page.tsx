import { notFound } from "next/navigation"
import { NewPage } from "@/components/new-page"
import { Notice } from "@/components/notice"
import { Page, PageHeader } from "@/components/page"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, type SearchParams } from "@/lib/url"
import { ListForm } from "../list-form"

// New guest list. ?event=<id> (from the event's Gästelisten) fixes the event and leads back there.
export default async function NewGuestListPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePerm("guestlists.manage")
  if (!ctx.modules.has("guestlists")) notFound()
  const t = await getT()
  const sp = await searchParams
  const raw = param(sp, "event")
  const { data: ev } = raw && /^[0-9a-f-]{36}$/.test(raw) ? await ctx.supabase.from("events").select("id, title, starts_at").eq("id", raw).eq("org_id", ctx.org.id).maybeSingle() : { data: null }
  const title = t("guestlists.new")
  if (!ev)
    return (
      <NewPage list={{ href: "/guestlists", label: t("guestlists.nav") }} title={title} error={param(sp, "error")}>
        <ListForm t={t} event="pick" artist={null} />
      </NewPage>
    )
  return (
    <Page size="form">
      <PageHeader
        crumbs={[{ href: "/events", label: t("eventsPage.nav") }, { href: `/events/${ev.id}/guestlists`, label: ev.title }, { label: title }]}
        title={title}
        meta={t.date(ev.starts_at, { dateStyle: "full", timeStyle: "short" })}
      />
      <Notice error={param(sp, "error")} />
      <ListForm t={t} event={{ id: ev.id, label: ev.title }} artist={null} />
    </Page>
  )
}

export const instant = false
